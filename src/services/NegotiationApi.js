import { NegotiationOrchestrator } from './NegotiationOrchestrator.js';
import { OutcomeEvaluationService } from './OutcomeEvaluationService.js';
import { NEGOTIATION_MODE } from '../constants/negotiationConstants.js';

// Synchronous Registry for zero-latency UI rendering & 100% test compatibility
const negotiationsRegistry = new Map();

function getAuthToken() {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem('negoforge_auth_token') || '';
}

function getAuthHeaders() {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function hasAuthToken() {
  return Boolean(getAuthToken());
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

/**
 * Backend API abstraction layer for NegoForge Negotiation Engine.
 */
export const NegotiationApi = {
  /**
   * Health Check
   */
  async checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) return await res.json();
    } catch (_e) {}
    return { status: 'offline', llm: { configured: false }, email: { configured: false } };
  },

  /**
   * Fetch Dashboard Stats (real stored data from server DB with local fallback)
   */
  async getDashboardStats() {
    try {
      const res = await fetch('/api/dashboard/stats', { headers: getAuthHeaders() });
      if (res.ok) return await res.json();
    } catch (_e) {}

    const allStates = Array.from(negotiationsRegistry.values()).map((o) => o.getCurrentState());
    const total = allStates.length;
    const agreements = allStates.filter((s) => s.negotiationStatus === 'AGREEMENT').length;
    const rejected = allStates.filter((s) => s.negotiationStatus === 'REJECTED' || s.negotiationStatus === 'DEADLOCK').length;
    const ongoing = allStates.filter((s) => s.negotiationStatus === 'IN_PROGRESS').length;

    return {
      totalNegotiations: total,
      successfulAgreements: agreements,
      failedNegotiations: rejected,
      ongoingSessions: ongoing,
      agreementRatePercentage: total > 0 ? Math.round((agreements / total) * 100) : 0,
      recentSessions: allStates.slice(-5),
    };
  },

  /**
   * Create a new negotiation session.
   */
  createNegotiation(scenario, agentConfigs, mode = NEGOTIATION_MODE.SIMULATION, humanAgentId = null, difficulty = 'Medium') {
    // Browser sessions use the authenticated backend as the single source of truth.
    // The synchronous local path remains only for unit tests that intentionally run
    // without an authenticated browser session.
    if (hasAuthToken()) {
      return requestJson('/api/sessions/create', {
        method: 'POST',
        body: JSON.stringify({ scenario, agentConfigs, mode, humanAgentId, difficulty }),
      });
    }

    const orchestrator = new NegotiationOrchestrator();
    const state = orchestrator.startNegotiation(scenario, agentConfigs, mode, humanAgentId);
    state.difficulty = difficulty;
    orchestrator.state.difficulty = difficulty;
    negotiationsRegistry.set(state.negotiationId, orchestrator);
    return state;
  },

  /**
   * Fetch current state of a negotiation by ID.
   */
  getNegotiationState(negotiationId) {
    if (hasAuthToken()) {
      return requestJson(`/api/sessions/${negotiationId}`);
    }
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) throw new Error(`Negotiation session ${negotiationId} not found.`);
    return orchestrator.getCurrentState();
  },

  /**
   * Fetch AgentInput payload formatted for current turn agent.
   */
  getAgentInput(negotiationId) {
    if (hasAuthToken()) return requestJson(`/api/sessions/${negotiationId}/agent-input`);
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) throw new Error(`Negotiation session ${negotiationId} not found.`);
    return orchestrator.getAgentInputForCurrentTurn();
  },

  /**
   * Submit an offer to the negotiation engine.
   */
  submitOffer(negotiationId, offerPayload) {
    if (hasAuthToken()) {
      return requestJson(`/api/sessions/${negotiationId}/offer`, {
        method: 'POST',
        body: JSON.stringify(offerPayload),
      });
    }
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) throw new Error(`Negotiation session ${negotiationId} not found.`);
    return orchestrator.processOffer(offerPayload);
  },

  /**
   * Submit a decision (ACCEPT, REJECT, COUNTEROFFER).
   */
  processDecision(negotiationId, decisionPayload) {
    if (hasAuthToken()) {
      return requestJson(`/api/sessions/${negotiationId}/decision`, {
        method: 'POST',
        body: JSON.stringify(decisionPayload),
      });
    }
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) throw new Error(`Negotiation session ${negotiationId} not found.`);
    return orchestrator.processDecision(decisionPayload);
  },

  /**
   * Executes one automated turn step using LLM Integration / Reasoning Engine.
   */
  executeTurn(negotiationId) {
    if (hasAuthToken()) {
      return requestJson(`/api/sessions/${negotiationId}/turn`, { method: 'POST' });
    }
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) throw new Error(`Negotiation session ${negotiationId} not found.`);
    return orchestrator.executeTurnStep();
  },

  /**
   * Resolves deadlock using automated Mediator Compromise.
   */
  resolveDeadlock(negotiationId) {
    if (hasAuthToken()) {
      return requestJson(`/api/sessions/${negotiationId}/resolve-deadlock`, { method: 'POST' });
    }
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) throw new Error(`Negotiation session ${negotiationId} not found.`);
    return orchestrator.resolveDeadlockWithCompromise();
  },

  /**
   * Extract terms from Natural Language message
   */
  async extractTerms(text, scenarioId) {
    try {
      const res = await fetch('/api/sessions/extract-nlp', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ text, scenarioId }),
      });
      if (res.ok) return await res.json();
    } catch (_e) {}

    // Fallback regex term extractor
    const num = text.match(/(?:₹|\$)?\s*([\d,]+)/);
    const val = num ? parseFloat(num[1].replace(/,/g, '')) : null;
    return { value: val, summary: text, extractedAttributes: {} };
  },

  /**
   * Get AI Negotiation Coaching Advice
   */
  async getCoachingAdvice(negotiationId) {
    if (hasAuthToken()) {
      return requestJson(`/api/sessions/${negotiationId}/coach`, { method: 'POST' });
    }

    const state = this.getNegotiationState(negotiationId);
    const currency = state.scenario?.currencySymbol || '$';
    const currentVal = state.currentOffer ? state.currentOffer.value : 100000;

    return {
      conservative: { type: 'Conservative Move', value: currentVal, description: `Propose ${currency}${currentVal.toLocaleString()} with standard terms.` },
      balanced: { type: 'Balanced Move (Recommended)', value: currentVal, description: `Compromise halfway on ${currency}${currentVal.toLocaleString()} with flexible delivery.` },
      aggressive: { type: 'Aggressive Move', value: currentVal, description: `Hold firm to maximize value on ${currency}${currentVal.toLocaleString()}.` },
      tradeOffOpportunities: [
        'Trade price flexibility for shorter payment deadlines.',
        'Offer order volume commitment in exchange for unit discount.',
      ],
    };
  },


  /** Apply a one-turn AI Coach strategy override to the current AI agent. */
  async applyCoachStrategy(negotiationId, agentId, strategy) {
    if (hasAuthToken()) {
      return requestJson(`/api/sessions/${negotiationId}/coach/apply`, {
        method: 'POST',
        body: JSON.stringify({ agentId, strategy }),
      });
    }
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) throw new Error(`Negotiation session ${negotiationId} not found.`);
    return orchestrator.applyStrategyOverride({ agentId, strategy });
  },

  /**
   * Generates structured outcome analysis report.
   */
  getOutcomeReport(negotiationId) {
    if (hasAuthToken()) return requestJson(`/api/sessions/${negotiationId}/report`);
    const state = this.getNegotiationState(negotiationId);
    return OutcomeEvaluationService.generateReport(state);
  },

  async sendEmailReport(negotiationId, recipientEmail) {
    const data = await requestJson(`/api/sessions/${negotiationId}/send-email`, {
      method: 'POST',
      body: JSON.stringify({ recipientEmail }),
    });
    return data;
  },

  /**
   * Retrieves full negotiation history log.
   */
  getNegotiationHistory(negotiationId) {
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) {
      throw new Error(`Negotiation session ${negotiationId} not found.`);
    }
    return orchestrator.getNegotiationHistory();
  },
};
