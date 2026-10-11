import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { dbAll, dbGet, dbRun } from './db.js';
import { authRouter, authenticateToken } from './auth.js';
import { extractTermsFromNaturalLanguage, generateCoachingSuggestions, getLLMStatus } from './llm.js';
import { sendNegotiationReportEmail, getEmailStatus } from './email.js';
import { NegotiationOrchestrator } from '../src/services/NegotiationOrchestrator.js';
import { OutcomeEvaluationService } from '../src/services/OutcomeEvaluationService.js';
import { NEGOTIATION_STATUS, DECISION_TYPE, NEGOTIATION_MODE } from '../src/constants/negotiationConstants.js';

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

function createRateLimiter({ windowMs, max, message }) {
  const requests = new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const current = requests.get(key);

    if (!current || now - current.startedAt >= windowMs) {
      requests.set(key, { startedAt: now, count: 1 });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfter = Math.ceil((windowMs - (now - current.startedAt)) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message });
    }

    return next();
  };
}

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many authentication requests. Please try again later.',
});

const nlpRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many NLP requests. Please slow down and try again shortly.',
});

// In-memory active orchestrators synced with SQLite DB
const activeOrchestrators = new Map();

// Helper to load or initialize orchestrator from DB
async function getOwnedSession(sessionId, userId) {
  return dbGet('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
}

async function getOrLoadOrchestrator(sessionId, userId) {
  const row = await getOwnedSession(sessionId, userId);
  if (!row) return null;

  if (activeOrchestrators.has(sessionId)) {
    return activeOrchestrators.get(sessionId);
  }

  const state = JSON.parse(row.state_json);
  const orchestrator = new NegotiationOrchestrator();
  orchestrator.state = state;
  activeOrchestrators.set(sessionId, orchestrator);
  return orchestrator;
}

// Helper to sync state to SQLite DB
async function syncStateToDb(sessionId, orchestrator, _userId = null) {
  const state = orchestrator.getCurrentState();
  const now = new Date().toISOString();

  await dbRun(
    `UPDATE sessions SET
      current_round = ?,
      current_agent_turn = ?,
      status = ?,
      deadlock_detected = ?,
      deadlock_reason = ?,
      agent_configs_json = ?,
      agent_stances_json = ?,
      current_offer_json = ?,
      previous_offer_json = ?,
      state_json = ?,
      updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      state.currentRound,
      state.currentAgentTurn,
      state.negotiationStatus,
      state.deadlockDetected ? 1 : 0,
      state.deadlockReason,
      JSON.stringify(state.agentPersonality || {}),
      JSON.stringify(state.agentStances || {}),
      JSON.stringify(state.currentOffer),
      JSON.stringify(state.previousOffer),
      JSON.stringify(state),
      now,
      sessionId,
      _userId,
    ]
  );

  return state;
}

// Auth Routes
app.use('/api/auth', authRateLimiter, authRouter);

// System Health & Diagnostics
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    llm: getLLMStatus(),
    email: getEmailStatus(),
  });
});

// GET /api/dashboard/stats - Real calculated statistics from DB
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const whereClause = 'WHERE user_id = ?';
    const params = [userId];

    const allSessions = await dbAll(`SELECT status, created_at, scenario_id FROM sessions ${whereClause}`, params);

    const total = allSessions.length;
    const agreements = allSessions.filter((s) => s.status === NEGOTIATION_STATUS.AGREEMENT).length;
    const rejected = allSessions.filter((s) => s.status === NEGOTIATION_STATUS.REJECTED).length;
    const deadlocks = allSessions.filter((s) => s.status === NEGOTIATION_STATUS.DEADLOCK).length;
    const ongoing = allSessions.filter((s) => s.status === NEGOTIATION_STATUS.IN_PROGRESS).length;

    const agreementRate = total > 0 ? Math.round((agreements / total) * 100) : 0;

    res.json({
      totalNegotiations: total,
      successfulAgreements: agreements,
      failedNegotiations: rejected + deadlocks,
      ongoingSessions: ongoing,
      agreementRatePercentage: agreementRate,
      recentSessions: allSessions.slice(-5),
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
});

// POST /api/sessions/create
app.post('/api/sessions/create', authenticateToken, async (req, res) => {
  try {
    const { scenario, agentConfigs, mode = 'SIMULATION', humanAgentId = null, difficulty = 'Medium', negotiationId } = req.body;
    const userId = req.user.id;

    if (!scenario || !scenario.id) {
      return res.status(400).json({ error: 'Scenario specification is required' });
    }

    const orchestrator = new NegotiationOrchestrator();
    const state = orchestrator.startNegotiation(scenario, agentConfigs, mode, humanAgentId);
    if (negotiationId) {
      state.negotiationId = negotiationId;
      orchestrator.state.negotiationId = negotiationId;
    }
    state.difficulty = difficulty;

    const now = new Date().toISOString();

    await dbRun(
      `INSERT INTO sessions (id, user_id, scenario_id, scenario_title, mode, human_role, current_round, current_agent_turn, status, deadlock_detected, deadlock_reason, difficulty, agent_configs_json, agent_stances_json, current_offer_json, previous_offer_json, state_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        state.negotiationId,
        userId,
        scenario.id,
        scenario.title,
        mode,
        humanAgentId,
        state.currentRound,
        state.currentAgentTurn,
        state.negotiationStatus,
        0,
        null,
        difficulty,
        JSON.stringify(agentConfigs || {}),
        JSON.stringify(state.agentStances || {}),
        JSON.stringify(state.currentOffer),
        JSON.stringify(state.previousOffer),
        JSON.stringify(state),
        now,
        now,
      ]
    );

    activeOrchestrators.set(state.negotiationId, orchestrator);
    res.status(201).json(state);
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ error: 'Failed to create negotiation session' });
  }
});

// GET /api/sessions - List negotiations with search, filter, pagination
app.get('/api/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { search, status, scenarioId, page = 1, limit = 10 } = req.query;

    const conditions = ['user_id = ?'];
    const params = [req.user.id];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (scenarioId) {
      conditions.push('scenario_id = ?');
      params.push(scenarioId);
    }

    if (search) {
      conditions.push('(scenario_title LIKE ? OR id LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const totalRow = await dbGet(`SELECT COUNT(*) as count FROM sessions ${whereSql}`, params);
    const rows = await dbAll(`SELECT id, scenario_id, scenario_title, mode, human_role, current_round, status, created_at, updated_at FROM sessions ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);

    res.json({
      sessions: rows,
      total: totalRow.count,
      page: parseInt(page),
      totalPages: Math.ceil(totalRow.count / parseInt(limit)),
    });
  } catch (err) {
    console.error('List sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/sessions/:id
app.get('/api/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const orchestrator = await getOrLoadOrchestrator(sessionId, req.user.id);
    if (!orchestrator) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(orchestrator.getCurrentState());
  } catch (_err) {
    res.status(500).json({ error: 'Failed to retrieve session state' });
  }
});

// GET /api/sessions/:id/agent-input - Inspect the current agent's structured input
app.get('/api/sessions/:id/agent-input', authenticateToken, async (req, res) => {
  try {
    const orchestrator = await getOrLoadOrchestrator(req.params.id, req.user.id);
    if (!orchestrator) return res.status(404).json({ error: 'Session not found' });
    const state = orchestrator.getCurrentState();
    if (state.negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) {
      return res.status(409).json({ error: 'Negotiation is not in progress' });
    }
    res.json(orchestrator.getAgentInputForCurrentTurn());
  } catch (_err) {
    res.status(500).json({ error: 'Failed to build agent input' });
  }
});

// POST /api/sessions/:id/turn - Execute AI Turn Step
app.post('/api/sessions/:id/turn', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const orchestrator = await getOrLoadOrchestrator(sessionId, req.user.id);
    if (!orchestrator) return res.status(404).json({ error: 'Session not found' });

    const state = orchestrator.getCurrentState();
    if (state.negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) {
      return res.status(409).json({ error: `Negotiation is already ${state.negotiationStatus}` });
    }

    // Simulation: both agents are automated. Practice: only the non-human
    // participant may be executed by the AI endpoint.
    if (state.mode === NEGOTIATION_MODE.PRACTICE && state.currentAgentTurn === state.humanAgentId) {
      return res.status(409).json({ error: "It is the human participant's turn" });
    }

    orchestrator.executeTurnStep();
    const updatedState = await syncStateToDb(sessionId, orchestrator, req.user?.id);
    res.json(updatedState);
  } catch (err) {
    console.error('Turn execution error:', err);
    res.status(500).json({ error: 'Failed to execute turn' });
  }
});

// POST /api/sessions/:id/offer - Process Human Offer
app.post('/api/sessions/:id/offer', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { agentId, value, terms, structuredTerms, reason } = req.body;

    if (typeof agentId !== 'string' || !agentId.trim()) {
      return res.status(422).json({ error: 'agentId is required' });
    }
    if (!Number.isFinite(Number(value)) || Number(value) < 0) {
      return res.status(422).json({ error: 'Offer value must be a valid non-negative number' });
    }

    const orchestrator = await getOrLoadOrchestrator(sessionId, req.user.id);
    if (!orchestrator) return res.status(404).json({ error: 'Session not found' });

    const state = orchestrator.getCurrentState();
    const validAgentIds = (state.scenario?.agents || []).map((agent) => agent.id || agent.name);
    if (!validAgentIds.includes(agentId)) {
      return res.status(422).json({ error: 'agentId does not belong to this negotiation' });
    }
    if (state.mode !== NEGOTIATION_MODE.PRACTICE || state.humanAgentId !== agentId) {
      return res.status(403).json({ error: 'Only the human agent may submit offers in Practice mode' });
    }
    if (state.currentAgentTurn !== agentId) {
      return res.status(409).json({ error: "It is not this agent's turn" });
    }

    orchestrator.processOffer({ agentId, value, terms, structuredTerms, reason });
    const updatedState = await syncStateToDb(sessionId, orchestrator, req.user?.id);
    res.json(updatedState);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to submit offer' });
  }
});

// POST /api/sessions/:id/decision - Process Decision
app.post('/api/sessions/:id/decision', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { agentId, decision, reason, counterOffer, stance } = req.body;

    if (!Object.values(DECISION_TYPE).includes(decision)) {
      return res.status(422).json({ error: 'Invalid negotiation decision' });
    }
    if (typeof agentId !== 'string' || !agentId.trim()) {
      return res.status(422).json({ error: 'agentId is required' });
    }

    const orchestrator = await getOrLoadOrchestrator(sessionId, req.user.id);
    if (!orchestrator) return res.status(404).json({ error: 'Session not found' });

    const state = orchestrator.getCurrentState();
    const validAgentIds = (state.scenario?.agents || []).map((agent) => agent.id || agent.name);
    if (!validAgentIds.includes(agentId)) {
      return res.status(422).json({ error: 'agentId does not belong to this negotiation' });
    }

    if (state.currentAgentTurn !== agentId) {
      return res.status(409).json({ error: "It is not this agent's turn" });
    }

    if (state.mode !== NEGOTIATION_MODE.PRACTICE || state.humanAgentId !== agentId) {
      return res.status(403).json({ error: 'Only the human participant may submit decisions in Practice mode' });
    }

    if (decision === DECISION_TYPE.COUNTEROFFER && !counterOffer) {
      return res.status(422).json({ error: 'counterOffer is required for a COUNTEROFFER decision' });
    }

    if (decision === DECISION_TYPE.COUNTEROFFER && counterOffer) {
      if (!Number.isFinite(Number(counterOffer.value)) || Number(counterOffer.value) < 0) {
        return res.status(422).json({ error: 'Counteroffer value must be a valid non-negative number' });
      }
      if (counterOffer.agentId && counterOffer.agentId !== agentId) {
        return res.status(422).json({ error: 'Counteroffer agentId must match the authenticated participant' });
      }
      if (counterOffer.terms !== undefined && counterOffer.terms !== null && typeof counterOffer.terms !== 'string' && (typeof counterOffer.terms !== 'object' || Array.isArray(counterOffer.terms))) {
        return res.status(422).json({ error: 'Counteroffer terms must be a structured object or text' });
      }
    }

    orchestrator.processDecision({ agentId, decision, reason, counterOffer, stance });
    const updatedState = await syncStateToDb(sessionId, orchestrator, req.user?.id);
    res.json(updatedState);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to process decision' });
  }
});

// POST /api/sessions/:id/resolve-deadlock - Resolve a detected deadlock
app.post('/api/sessions/:id/resolve-deadlock', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const orchestrator = await getOrLoadOrchestrator(sessionId, req.user.id);
    if (!orchestrator) return res.status(404).json({ error: 'Session not found' });

    const state = orchestrator.getCurrentState();
    if (state.negotiationStatus !== NEGOTIATION_STATUS.DEADLOCK) {
      return res.status(409).json({ error: 'Deadlock resolution is only available for a detected deadlock' });
    }

    const updatedState = orchestrator.resolveDeadlockWithCompromise();
    const persistedState = await syncStateToDb(sessionId, orchestrator, req.user.id);
    res.json(persistedState || updatedState);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to resolve deadlock' });
  }
});

// POST /api/sessions/extract-nlp - Natural Language Term Extraction
app.post('/api/sessions/extract-nlp', authenticateToken, nlpRateLimiter, async (req, res) => {
  try {
    const { text, scenarioId } = req.body;
    if (typeof text !== 'string' || text.trim().length === 0) {
      return res.status(422).json({ error: 'Text is required' });
    }
    if (text.length > 5000) {
      return res.status(422).json({ error: 'Text must be 5000 characters or fewer' });
    }
    const extracted = await extractTermsFromNaturalLanguage(text.trim(), scenarioId);
    res.json(extracted);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to extract terms from message' });
  }
});

// POST /api/sessions/:id/coach - AI Negotiation Coaching Advice
app.post('/api/sessions/:id/coach', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const orchestrator = await getOrLoadOrchestrator(sessionId, req.user.id);
    if (!orchestrator) return res.status(404).json({ error: 'Session not found' });

    const state = orchestrator.getCurrentState();
    const suggestions = await generateCoachingSuggestions({
      scenario: state.scenario,
      currentOffer: state.currentOffer,
      history: state.negotiationHistory,
      humanAgentId: state.humanAgentId,
      currentAgentId: state.currentAgentTurn,
      mode: state.mode,
      difficulty: state.difficulty || 'Medium',
      agentPersonality: state.agentPersonality?.[state.currentAgentTurn],
    });

    res.json(suggestions);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to generate coaching suggestions' });
  }
});

// POST /api/sessions/:id/coach/apply - Apply a one-turn AI Coach strategy override
app.post('/api/sessions/:id/coach/apply', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { agentId, strategy } = req.body;
    const orchestrator = await getOrLoadOrchestrator(sessionId, req.user.id);
    if (!orchestrator) return res.status(404).json({ error: 'Session not found' });

    const state = orchestrator.getCurrentState();
    if (state.mode !== NEGOTIATION_MODE.SIMULATION) {
      return res.status(409).json({ error: 'AI strategy overrides are available in AI vs AI simulation mode.' });
    }
    if (typeof agentId !== 'string' || agentId !== state.currentAgentTurn) {
      return res.status(409).json({ error: 'The strategy must target the current AI turn.' });
    }

    const updatedState = orchestrator.applyStrategyOverride({ agentId, strategy });
    const persistedState = await syncStateToDb(sessionId, orchestrator, req.user.id);
    res.json(persistedState || updatedState);
  } catch (err) {
    res.status(422).json({ error: err.message || 'Failed to apply strategy override' });
  }
});

// GET /api/sessions/:id/report - Structured Outcome Report
app.get('/api/sessions/:id/report', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const orchestrator = await getOrLoadOrchestrator(sessionId, req.user.id);
    if (!orchestrator) return res.status(404).json({ error: 'Session not found' });

    const state = orchestrator.getCurrentState();
    const report = OutcomeEvaluationService.generateReport(state);

    if (state.negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) {
      await dbRun(
        `INSERT OR REPLACE INTO reports (id, session_id, user_id, scenario_id, status, rounds_taken, agreement_term, final_price, negotiation_score, report_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `rep_${sessionId}`,
          sessionId,
          req.user?.id || null,
          state.scenario?.id || 'default',
          report.status,
          report.roundsTaken,
          report.agreementTerm,
          report.finalPrice,
          report.negotiationScore,
          JSON.stringify(report),
          new Date().toISOString(),
        ]
      );
    }

    res.json(report);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to generate outcome report' });
  }
});

// POST /api/sessions/:id/send-email - Email Negotiation Results
app.post('/api/sessions/:id/send-email', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { recipientEmail } = req.body;

    const orchestrator = await getOrLoadOrchestrator(sessionId, req.user.id);
    if (!orchestrator) return res.status(404).json({ error: 'Session not found' });

    const state = orchestrator.getCurrentState();
    const report = OutcomeEvaluationService.generateReport(state);

    const result = await sendNegotiationReportEmail({
      recipientEmail,
      report,
      userId: req.user?.id,
    });

    res.json(result);
  } catch (err) {
    console.error('Send email endpoint error:', err);
    res.status(500).json({ error: err.message || 'Failed to send email report' });
  }
});

app.listen(PORT, () => {
  console.log(`NegoForge Express Backend running on http://localhost:${PORT}`);
});
