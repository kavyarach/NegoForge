import { useState, useEffect, useRef } from 'react';
import { NegotiationApi } from '../services/NegotiationApi';
import {
  NEGOTIATION_STATUS,
  CONCESSION_DIRECTION,
  NEGOTIATION_MODE,
  DECISION_TYPE,
  STANCE_TYPE,
} from '../constants/negotiationConstants';
import { OutcomeReportModal } from './OutcomeReportModal';
import { AICoachPanel } from './AICoachPanel';
import { NegotiationAnalyticsCharts } from './NegotiationAnalyticsCharts';

export function NegotiationArenaPanel({ state, onStateChange, onReset }) {
  const [humanValue, setHumanValue] = useState('');
  const [humanTerms, setHumanTerms] = useState({});
  const [humanReason, setHumanReason] = useState('');
  const [humanDecisionType, setHumanDecisionType] = useState(DECISION_TYPE.COUNTEROFFER);
  const [isPaused, setIsPaused] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(1500);
  const [selectedLang, setSelectedLang] = useState('en');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const [isExecutingTurn, setIsExecutingTurn] = useState(false);

  const handleStartListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition API is not supported in this browser. Please type your message.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = selectedLang === 'te' ? 'te-IN' : selectedLang === 'hi' ? 'hi-IN' : 'en-US';
    setIsListening(true);
    recognition.onresult = (event) => {
      const transcriptText = event.results[0][0].transcript;
      setHumanReason(transcriptText);
      setIsListening(false);
      // Auto-extract numbers from voice input
      const numMatch = transcriptText.match(/(?:₹|\$)?\s*([\d,]+)/);
      if (numMatch) {
        setHumanValue(parseFloat(numMatch[1].replace(/,/g, '')));
      }
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const handleSpeakText = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = selectedLang === 'te' ? 'te-IN' : selectedLang === 'hi' ? 'hi-IN' : 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };
  const [showAgentInputModal, setShowAgentInputModal] = useState(false);
  const [showOutcomeReportModal, setShowOutcomeReportModal] = useState(false);
  const [agentInputData, setAgentInputData] = useState(null);
  const [outcomeReport, setOutcomeReport] = useState(null);

  const turnInProgressRef = useRef(false);
  const transcriptEndRef = useRef(null);

  const negotiationId = state?.negotiationId;
  const scenario = state?.scenario;
  const mode = state?.mode || NEGOTIATION_MODE.SIMULATION;
  const humanAgentId = state?.humanAgentId;
  const currentRound = state?.currentRound || 1;
  const currentAgentTurn = state?.currentAgentTurn;
  const currentOffer = state?.currentOffer;
  const previousOffer = state?.previousOffer;
  const negotiationStatus = state?.negotiationStatus || NEGOTIATION_STATUS.IN_PROGRESS;
  const deadlockDetected = state?.deadlockDetected;
  const deadlockReason = state?.deadlockReason;
  const agentGoals = state?.agentGoals || {};
  const agentPersonality = state?.agentPersonality || {};
  const agentStances = state?.agentStances || {};
  const negotiationHistory = state?.negotiationHistory || [];

  const currency = scenario?.currencySymbol || '$';
  const unit = scenario?.unit || 'Amount';
  const multiTermDefinitions = scenario?.multiTerms || [];

  const formatOfferTerms = (offer) => {
    if (!offer?.terms || typeof offer.terms !== 'object' || Array.isArray(offer.terms)) {
      return offer?.terms || '';
    }
    return multiTermDefinitions
      .map((definition) => {
        const value = offer.terms[definition.name];
        if (value === undefined || value === null || value === '') return null;
        return `${definition.label}: ${value}${definition.unit ? ` ${definition.unit}` : ''}`;
      })
      .filter(Boolean)
      .join(' • ');
  };

  useEffect(() => {
    const sourceTerms = currentOffer?.terms && typeof currentOffer.terms === 'object' && !Array.isArray(currentOffer.terms)
      ? currentOffer.terms
      : Object.fromEntries(multiTermDefinitions.map((definition) => [definition.name, definition.default]));
    setHumanTerms(sourceTerms || {});
  }, [currentOffer?.offerId, scenario?.id]);

  const agents = scenario?.agents || [];
  const agent1 = agents[0] ? (agents[0].id || agents[0].name) : 'Agent1';
  const agent2 = agents[1] ? (agents[1].id || agents[1].name) : 'Agent2';
  const activeHumanRole = humanAgentId || agent1;

  const isHumanTurn =
    mode === NEGOTIATION_MODE.PRACTICE &&
    negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS &&
    currentAgentTurn === humanAgentId;

  const isAiThinking = isExecutingTurn;
  const thinkingAgent = isExecutingTurn ? currentAgentTurn : null;

  const humanAgentObj = agents.find((a) => (a.id || a.name) === activeHumanRole) || agents[0];

  // Price Convergence Metric
  const initialVal1 = scenario?.initialOfferValue || 100000;
  const initialVal2 = agents[1]?.baselineTarget || 80000;
  const initialGap = Math.abs(initialVal1 - initialVal2);

  let currentGap = initialGap;
  if (currentOffer && previousOffer) {
    currentGap = Math.abs(currentOffer.value - previousOffer.value);
  } else if (currentOffer) {
    currentGap = Math.abs(currentOffer.value - initialVal2);
  }

  const gapReduction =
    initialGap > 0
      ? Math.max(0, Math.min(100, Math.round(((initialGap - currentGap) / initialGap) * 100)))
      : 0;

  // ZOPA & BATNA Analytical Metrics (Unique Feature 1)
  const buyerReservation = scenario?.initialOfferValue ? Math.round(scenario.initialOfferValue * 1.15) : 115000;
  const sellerReservation = scenario?.agents?.[1]?.baselineTarget ? Math.round(scenario.agents[1].baselineTarget * 0.85) : 75000;
  const zopaMin = Math.min(buyerReservation, sellerReservation);
  const zopaMax = Math.max(buyerReservation, sellerReservation);
  const currentOfferVal = currentOffer ? currentOffer.value : null;
  const isInZopa = currentOfferVal ? (currentOfferVal >= zopaMin && currentOfferVal <= zopaMax) : false;

  // Deal Sentiment & Tension Gauge (Unique Feature 3)
  const tensionLevel = deadlockDetected
    ? 'HIGH TENSION (DEADLOCK)'
    : negotiationHistory.length >= 4 && gapReduction < 30
      ? 'MODERATE STALEMATE'
      : 'HARMONIOUS PROGRESS';
  const tensionColor = deadlockDetected ? '#ef4444' : gapReduction < 30 ? '#f59e0b' : '#10b981';

  // Tactical Counteroffer Chip Handler (Unique Feature 2)
  const handleApplyTacticalChip = (type) => {
    const baseVal = currentOffer ? currentOffer.value : initialVal1;
    let targetVal = baseVal;
    let rationale = '';

    if (type === 'aggressive') {
      targetVal = Math.round(baseVal * (humanAgentId === agent1 ? 1.12 : 0.88));
      rationale = `Proposing an aggressive anchor of ${currency}${targetVal.toLocaleString()} to maximize negotiation position.`;
    } else if (type === 'fair') {
      const oppTarget = humanAgentId === agent1 ? (scenario?.agents?.[1]?.baselineTarget || 80000) : (scenario?.initialOfferValue || 100000);
      targetVal = Math.round((baseVal + oppTarget) / 2);
      rationale = `Proposing a fair 50/50 compromise midpoint of ${currency}${targetVal.toLocaleString()} to accelerate agreement.`;
    } else if (type === 'soft') {
      targetVal = Math.round(baseVal * (humanAgentId === agent1 ? 1.04 : 0.96));
      rationale = `Making a subtle concession to ${currency}${targetVal.toLocaleString()} to keep negotiations active.`;
    }

    setHumanValue(targetVal);
    setHumanReason(rationale);
    setHumanDecisionType(DECISION_TYPE.COUNTEROFFER);
  };

  // Auto-scroll transcript when new entries arrive or when thinking starts
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [negotiationHistory.length, isAiThinking]);

  if (!state) return null;

  // Handle Manual Step Turn (if paused or debugging)
  const handleManualStepTurn = async () => {
    if (negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS || turnInProgressRef.current) return;
    turnInProgressRef.current = true;
    setIsExecutingTurn(true);
    setError(null);

    try {
      const newState = await NegotiationApi.executeTurn(negotiationId);
      onStateChange(newState);
    } catch (err) {
      console.error('Turn execution error:', err);
      setError(err?.message || 'AI response could not be generated. Please retry.');
    } finally {
      turnInProgressRef.current = false;
      setIsExecutingTurn(false);
    }
  };

  // Handle Retry after error
  const handleRetryAiTurn = () => {
    setError(null);
    handleManualStepTurn();
  };

  // Toggle Auto-Play Pause / Resume in Simulation Mode
  const handleTogglePause = () => {
    if (negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) return;
    setIsPaused((prev) => !prev);
  };

  // Automatic AI-vs-AI execution. The backend performs the authoritative turn
  // and returns the persisted state; this effect only controls presentation timing.
  useEffect(() => {
    if (mode !== NEGOTIATION_MODE.SIMULATION) return undefined;
    if (isPaused || error || negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) return undefined;
    if (turnInProgressRef.current) return undefined;

    const timer = window.setTimeout(() => {
      handleManualStepTurn();
    }, autoSpeed);

    return () => window.clearTimeout(timer);
  }, [
    mode,
    isPaused,
    error,
    negotiationStatus,
    negotiationId,
    currentRound,
    currentAgentTurn,
    negotiationHistory.length,
    autoSpeed,
    isExecutingTurn,
  ]);

  // Handle Human Submission & Trigger AI Counterpart Response
  const handleHumanSubmit = async (e) => {
    e.preventDefault();
    if (negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) return;

    try {
      setError(null);
      let newState;
      const effectiveRole = activeHumanRole;

      if (humanDecisionType === DECISION_TYPE.ACCEPT) {
        newState = await NegotiationApi.processDecision(negotiationId, {
          agentId: effectiveRole,
          decision: DECISION_TYPE.ACCEPT,
          reason:
            humanReason ||
            `Human participant (${effectiveRole}) accepted the proposal of ${currency}${currentOffer?.value?.toLocaleString()}.`,
          stance: STANCE_TYPE.FLEXIBLE,
        });
      } else if (humanDecisionType === DECISION_TYPE.REJECT) {
        newState = await NegotiationApi.processDecision(negotiationId, {
          agentId: effectiveRole,
          decision: DECISION_TYPE.REJECT,
          reason:
            humanReason ||
            `Human participant (${effectiveRole}) rejected the current proposal.`,
          stance: STANCE_TYPE.STUBBORN,
        });
      } else {
        // Counteroffer or opening offer
        if (!humanValue) return;
        const val = Number(humanValue);

        if (!currentOffer) {
          // Opening proposal
          newState = await NegotiationApi.submitOffer(negotiationId, {
            agentId: effectiveRole,
            value: val,
            terms: humanTerms,
            structuredTerms: humanTerms,
            reason:
              humanReason ||
              `Opening negotiation with a proposed ${unit.toLowerCase()} of ${currency}${val.toLocaleString()}.`,
          });
        } else {
          // Counteroffer
          const counterOffer = {
            value: val,
            terms: humanTerms,
            agentId: effectiveRole,
            roundNumber: currentRound,
            reason:
              humanReason ||
              `Counter-proposal of ${currency}${val.toLocaleString()} in Round ${currentRound}.`,
          };

          newState = await NegotiationApi.processDecision(negotiationId, {
            agentId: effectiveRole,
            decision: DECISION_TYPE.COUNTEROFFER,
            reason: humanReason || counterOffer.reason,
            counterOffer,
            stance: STANCE_TYPE.MODERATE,
          });
        }
      }

      // If negotiation is still in progress, execute AI counterpart turn response!
      if (newState && newState.negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS) {
        newState = await NegotiationApi.executeTurn(negotiationId);
      }

      onStateChange(newState);
      setHumanValue('');
      setHumanReason('');
    } catch (err) {
      console.error('Human submit error:', err);
      setError('Failed to submit offer. Please check values and try again.');
    }
  };

  const handleResolveDeadlock = async () => {
    try {
      const newState = await NegotiationApi.resolveDeadlock(negotiationId);
      onStateChange(newState);
    } catch (err) {
      console.error('Deadlock resolution error:', err);
    }
  };

  const handleInspectAgentInput = async () => {
    try {
      const inputData = await NegotiationApi.getAgentInput(negotiationId);
      setAgentInputData(inputData);
      setShowAgentInputModal(true);
    } catch (err) {
      console.error('Failed to get agent input:', err);
    }
  };

  const handleOpenOutcomeReport = async () => {
    try {
      const report = await NegotiationApi.getOutcomeReport(negotiationId);
      setOutcomeReport(report);
      setShowOutcomeReportModal(true);
    } catch (err) {
      console.error('Failed to get report:', err);
    }
  };

  const getStanceBadgeColor = (stance) => {
    switch (stance) {
      case STANCE_TYPE.FIRM:
        return '#ef4444';
      case STANCE_TYPE.FLEXIBLE:
        return '#10b981';
      case STANCE_TYPE.YIELDING:
        return '#38bdf8';
      case STANCE_TYPE.STUBBORN:
        return '#8b5cf6';
      default:
        return '#f59e0b';
    }
  };

  const getAgentRole = (agentId) => {
    const found = agents.find((a) => (a.id || a.name) === agentId);
    return found ? found.role : '';
  };

  // Determine Live Status Text & Color
  let liveStatusText = 'READY';
  let liveStatusColor = '#38bdf8';
  let liveStatusIndicatorClass = 'cyan';

  if (negotiationStatus === NEGOTIATION_STATUS.AGREEMENT) {
    liveStatusText = 'AGREEMENT REACHED';
    liveStatusColor = '#10b981';
    liveStatusIndicatorClass = 'emerald';
  } else if (negotiationStatus === NEGOTIATION_STATUS.REJECTED) {
    liveStatusText = 'NEGOTIATION REJECTED';
    liveStatusColor = '#ef4444';
    liveStatusIndicatorClass = 'red';
  } else if (negotiationStatus === NEGOTIATION_STATUS.DEADLOCK) {
    liveStatusText = currentRound >= 5 ? 'MAX ROUNDS REACHED / DEADLOCK' : 'DEADLOCK DETECTED';
    liveStatusColor = '#f59e0b';
    liveStatusIndicatorClass = 'amber';
  } else if (negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS) {
    if (mode === NEGOTIATION_MODE.PRACTICE) {
      if (isHumanTurn) {
        liveStatusText = 'YOUR TURN';
        liveStatusColor = '#8b5cf6';
        liveStatusIndicatorClass = 'violet';
      } else if (isAiThinking) {
        liveStatusText = thinkingAgent ? `${thinkingAgent.toUpperCase()} THINKING...` : 'AI THINKING...';
        liveStatusColor = '#38bdf8';
        liveStatusIndicatorClass = 'cyan';
      } else {
        liveStatusText = currentAgentTurn ? `${currentAgentTurn.toUpperCase()} TURN` : 'AI TURN';
        liveStatusColor = '#38bdf8';
        liveStatusIndicatorClass = 'cyan';
      }
    } else {
      // Simulation Mode
      if (isPaused) {
        liveStatusText = 'PAUSED';
        liveStatusColor = '#f59e0b';
        liveStatusIndicatorClass = 'amber';
      } else if (isAiThinking) {
        liveStatusText = thinkingAgent ? `${thinkingAgent.toUpperCase()} THINKING...` : 'AI THINKING...';
        liveStatusColor = '#38bdf8';
        liveStatusIndicatorClass = 'cyan';
      } else {
        liveStatusText = currentAgentTurn ? `${currentAgentTurn.toUpperCase()} AUTO-EXECUTING` : 'AI AUTO-PLAY';
        liveStatusColor = '#10b981';
        liveStatusIndicatorClass = 'emerald';
      }
    }
  }

  return (
    <div className="negotiation-arena-wrapper" style={{ width: '100%' }}>
      {/* Header Bar */}
      <div
        className="arena-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-card)',
          padding: '22px 28px',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          marginBottom: '24px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
            <span
              className="badge badge-id"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--primary-brand)',
                border: '1px solid var(--border-color)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 700,
              }}
            >
              ID: {negotiationId}
            </span>

            <span
              style={{
                background:
                  mode === NEGOTIATION_MODE.PRACTICE
                    ? 'var(--purple-bg)'
                    : 'var(--primary-brand-bg)',
                border: `1px solid ${
                  mode === NEGOTIATION_MODE.PRACTICE ? 'var(--purple-accent)' : 'var(--primary-brand)'
                }`,
                color: mode === NEGOTIATION_MODE.PRACTICE ? 'var(--purple-accent)' : 'var(--primary-brand)',
                padding: '4px 12px',
                borderRadius: '14px',
                fontSize: '0.85rem',
                fontWeight: 800,
              }}
            >
              {mode === NEGOTIATION_MODE.PRACTICE
                ? '👤 PRACTICE MODE (AI VS HUMAN)'
                : '🤖 AUTONOMOUS SIMULATION (AI VS AI)'}
            </span>
          </div>

          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Negotiation Arena — {scenario?.title}
          </h2>

          <p style={{ margin: '6px 0 0 0', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Round <strong>{currentRound}</strong> / 5 | Active Turn:{' '}
            <strong
              style={{
                color:
                  mode === NEGOTIATION_MODE.PRACTICE && currentAgentTurn === humanAgentId
                    ? 'var(--purple-accent)'
                    : 'var(--primary-brand)',
              }}
            >
              {currentAgentTurn
                ? mode === NEGOTIATION_MODE.PRACTICE && currentAgentTurn === humanAgentId
                  ? `${currentAgentTurn} (YOU)`
                  : `${currentAgentTurn} (AI)`
                : 'Concluded'}
            </strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {mode === NEGOTIATION_MODE.SIMULATION && (
            <button
              onClick={handleManualStepTurn}
              disabled={negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS || isAiThinking}
              style={{
                padding: '10px 18px',
                borderRadius: '9px',
                fontSize: '0.9rem',
                fontWeight: 800,
                cursor: negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS && !isAiThinking ? 'pointer' : 'not-allowed',
                background: 'var(--primary-brand)',
                border: 'none',
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)',
                opacity: negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS && !isAiThinking ? 1 : 0.6,
              }}
            >
              ⚡ Step Now
            </button>
          )}

          {/* Live Status Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 18px',
              borderRadius: '20px',
              background: 'var(--bg-secondary)',
              border: `1px solid ${liveStatusColor}`,
              color: liveStatusColor,
              fontWeight: 800,
              fontSize: '0.875rem',
              letterSpacing: '0.5px',
            }}
          >
            <span className={`pulsing-indicator ${liveStatusIndicatorClass}`} />
            <span>{liveStatusText}</span>
            {isAiThinking && (
              <div className="thinking-dots">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          <button
            onClick={handleOpenOutcomeReport}
            className="btn btn-outline"
            style={{
              padding: '10px 18px',
              borderRadius: '9px',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}
          >
            📊 Outcome Report
          </button>

          <button
            className="btn btn-secondary"
            onClick={onReset}
            style={{
              padding: '10px 18px',
              borderRadius: '9px',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
            }}
          >
            Reset Setup
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--danger-color)',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ color: 'var(--danger-color)', fontSize: '0.95rem', fontWeight: 600 }}>
            ⚠️ {error}
          </div>
          <button
            onClick={handleRetryAiTurn}
            className="btn"
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              background: 'var(--danger-color)',
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
            }}
          >
            ⚡ Retry AI Turn
          </button>
        </div>
      )}

      {/* Live Agent Cards & Metrics Panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '18px',
          marginBottom: '24px',
        }}
      >
        {/* Agent 1 Stance Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            padding: '18px',
            borderRadius: '12px',
            border: `1px solid ${
              mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent1
                ? 'var(--purple-accent)'
                : 'var(--border-color)'
            }`,
            boxShadow:
              mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent1
                ? '0 0 14px rgba(124, 58, 237, 0.15)'
                : 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
            }}
          >
            <span
              style={{
                fontSize: '0.85rem',
                color:
                  mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent1
                    ? 'var(--purple-accent)'
                    : 'var(--text-secondary)',
                textTransform: 'uppercase',
                fontWeight: 800,
              }}
            >
              {agent1}{' '}
              {mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent1
                ? '👤 (YOU)'
                : '🤖 (AI)'}
            </span>

            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: '12px',
                background: getStanceBadgeColor(agentStances[agent1] || 'Moderate'),
                color: '#ffffff',
              }}
            >
              Stance: {agentStances[agent1] || 'Moderate'}
            </span>
          </div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700 }}>
            {agentPersonality[agent1] || 'Collaborative'}
          </h4>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Goal: {agentGoals[agent1]}
          </p>
        </div>

        {/* Agent 2 Stance Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            padding: '18px',
            borderRadius: '12px',
            border: `1px solid ${
              mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent2
                ? 'var(--purple-accent)'
                : 'var(--border-color)'
            }`,
            boxShadow:
              mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent2
                ? '0 0 14px rgba(124, 58, 237, 0.15)'
                : 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
            }}
          >
            <span
              style={{
                fontSize: '0.85rem',
                color:
                  mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent2
                    ? 'var(--purple-accent)'
                    : 'var(--text-secondary)',
                textTransform: 'uppercase',
                fontWeight: 800,
              }}
            >
              {agent2}{' '}
              {mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent2
                ? '👤 (YOU)'
                : '🤖 (AI)'}
            </span>

            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: '12px',
                background: getStanceBadgeColor(agentStances[agent2] || 'Moderate'),
                color: '#ffffff',
              }}
            >
              Stance: {agentStances[agent2] || 'Moderate'}
            </span>
          </div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700 }}>
            {agentPersonality[agent2] || 'Collaborative'}
          </h4>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Goal: {agentGoals[agent2]}
          </p>
        </div>

        {/* Live Convergence & Gap Metric */}
        <div
          style={{
            background: 'var(--bg-card)',
            padding: '18px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Price Convergence
          </span>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '6px',
            }}
          >
            <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary-brand)' }}>
              Gap: {currency}
              {currentGap.toLocaleString()}
            </span>
            <span style={{ fontSize: '0.95rem', color: 'var(--success-color)', fontWeight: 800 }}>
              {gapReduction}% Bridged
            </span>
          </div>
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              height: '10px',
              borderRadius: '5px',
              marginTop: '10px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${gapReduction}%`,
                height: '100%',
                background: 'var(--success-color)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Current Active Offer Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            padding: '18px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Current Offer on Table
          </span>
          {currentOffer ? (
            <div style={{ marginTop: '6px' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary-brand)' }}>
                {currency}
                {currentOffer.value.toLocaleString()}
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                By {currentOffer.agentId} (Round {currentOffer.roundNumber})
              </span>
              {formatOfferTerms(currentOffer) && (
                <div style={{ marginTop: '8px', fontSize: '0.78rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                  {formatOfferTerms(currentOffer)}
                </div>
              )}
            </div>
          ) : (
            <p
              style={{
                margin: '6px 0 0 0',
                fontSize: '0.9rem',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}
            >
              Opening proposal pending...
            </p>
          )}
        </div>

        {/* Unique Feature 1 & 3: ZOPA Zone & Deal Sentiment Visualizer Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            padding: '18px',
            borderRadius: '12px',
            border: `1px solid ${isInZopa ? 'var(--success-color)' : 'var(--border-color)'}`,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              ZOPA & BATNA Radar
            </span>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '10px',
                background: tensionColor,
                color: '#ffffff',
              }}
            >
              {tensionLevel}
            </span>
          </div>

          <div style={{ marginTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {isInZopa ? '🎯 In Win-Win ZOPA Range' : '⚡ Outside Walkaway ZOPA'}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {currency}{zopaMin.toLocaleString()} - {currency}{zopaMax.toLocaleString()}
              </span>
            </div>

            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                height: '8px',
                borderRadius: '4px',
                marginTop: '10px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: isInZopa ? '80%' : '35%',
                  height: '100%',
                  background: isInZopa ? 'var(--success-color)' : 'var(--warning-color)',
                  borderRadius: '4px',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Visual Analytics & Data Charts Section */}
      <NegotiationAnalyticsCharts history={negotiationHistory} scenario={scenario} />

      {/* Deadlock Detection Alert & Mediator Resolution Banner */}
      {deadlockDetected && negotiationStatus === NEGOTIATION_STATUS.DEADLOCK && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid #f59e0b',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <span
              style={{
                background: '#f59e0b',
                color: '#080b14',
                fontSize: '0.7rem',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '4px',
                textTransform: 'uppercase',
              }}
            >
              DEADLOCK DETECTED
            </span>
            <h3 style={{ margin: '6px 0 4px 0', fontSize: '1.2rem', color: '#f59e0b' }}>
              Negotiation Stalled
            </h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#f1f5f9' }}>
              {deadlockReason || 'Neither party is making further concessions.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleResolveDeadlock}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                background: '#f59e0b',
                border: 'none',
                color: '#080b14',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
            >
              ⚡ Apply Mediator Compromise
            </button>
          </div>
        </div>
      )}

      {/* Negotiation Arena Chat Transcript */}
      <div
        className="transcript-section"
        style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '14px',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '1.25rem',
              color: 'var(--text-primary)',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            💬 Negotiation Transcript & Reasoning Log
          </h3>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            {negotiationHistory.length} Exchanges Recorded
          </span>
        </div>

        {negotiationHistory.length === 0 && !isAiThinking ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
            <p style={{ fontSize: '1.15rem', margin: '0 0 8px 0', color: 'var(--text-primary)', fontWeight: 700 }}>
              The negotiation has initialized.
            </p>
            <p style={{ fontSize: '0.95rem', margin: '0 0 16px 0' }}>
              {mode === NEGOTIATION_MODE.PRACTICE
                ? currentAgentTurn === humanAgentId
                  ? 'Submit your opening proposal below to begin the negotiation.'
                  : 'Click below to generate the opening AI proposal.'
                : 'AI agents will negotiate automatically. Use Pause or Step Now to take control.'}
            </p>
            {negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS && (
              <button
                onClick={handleManualStepTurn}
                className="btn btn-primary"
                style={{
                  padding: '12px 24px',
                  borderRadius: '10px',
                  fontSize: '1rem',
                  fontWeight: 800,
                  background: 'var(--primary-brand)',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)',
                }}
              >
                ⚡ Execute Opening AI Proposal →
              </button>
            )}
          </div>
        ) : (
          <div
            className="chat-transcript-list"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              maxHeight: '480px',
              overflowY: 'auto',
              paddingRight: '8px',
            }}
          >
            {negotiationHistory.map((item, idx) => {
              const isHuman =
                mode === NEGOTIATION_MODE.PRACTICE && item.agent === humanAgentId;
              const isAgent1 = item.agent === agent1;
              const role = getAgentRole(item.agent);

              return (
                <div
                  key={idx}
                  className={`chat-bubble-row ${isHuman ? 'right-row' : isAgent1 ? 'left-row' : 'right-row'}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isHuman ? 'flex-end' : isAgent1 ? 'flex-start' : 'flex-end',
                    width: '100%',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'center',
                      marginBottom: '6px',
                      fontSize: '0.85rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <strong style={{ color: isHuman ? 'var(--purple-accent)' : 'var(--primary-brand)', fontWeight: 800 }}>
                      {isHuman ? `👤 YOU (${role || item.agent})` : `🤖 ${item.agent} (${role || ''})`}
                    </strong>
                    <span>• Round {item.round}</span>
                    {item.stance && (
                      <span
                        style={{
                          background: getStanceBadgeColor(item.stance),
                          color: '#ffffff',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                        }}
                      >
                        {item.stance}
                      </span>
                    )}
                    <span>
                      •{' '}
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Speech Bubble */}
                  <div
                    className="speech-bubble"
                    style={{
                      maxWidth: '85%',
                      padding: '18px 22px',
                      borderRadius: '16px',
                      background: isHuman ? 'var(--purple-bg)' : 'var(--bg-secondary)',
                      border: `1px solid ${
                        isHuman
                          ? 'var(--purple-accent)'
                          : isAgent1
                          ? 'var(--border-color)'
                          : 'var(--primary-brand)'
                      }`,
                      boxShadow: isHuman
                        ? '0 4px 14px rgba(124, 58, 237, 0.12)'
                        : 'var(--shadow-sm)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '10px',
                        gap: '16px',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: '0.85rem',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background:
                            item.action === 'ACCEPT'
                              ? 'rgba(5, 150, 105, 0.15)'
                              : item.action === 'REJECT'
                              ? 'rgba(220, 38, 38, 0.15)'
                              : isHuman
                              ? 'var(--purple-bg)'
                              : 'var(--primary-brand-bg)',
                          border: `1px solid ${
                            item.action === 'ACCEPT'
                              ? 'var(--success-color)'
                              : item.action === 'REJECT'
                              ? 'var(--danger-color)'
                              : isHuman
                              ? 'var(--purple-accent)'
                              : 'var(--primary-brand)'
                          }`,
                          color:
                            item.action === 'ACCEPT'
                              ? 'var(--success-color)'
                              : item.action === 'REJECT'
                              ? 'var(--danger-color)'
                              : isHuman
                              ? 'var(--purple-accent)'
                              : 'var(--primary-brand)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {item.action || item.decision}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {item.offer && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                            <span
                              style={{
                                fontWeight: 800,
                                fontSize: '1.2rem',
                                color: isHuman ? 'var(--purple-accent)' : 'var(--primary-brand)',
                              }}
                            >
                              {currency}
                              {item.offer.value.toLocaleString()}
                            </span>
                            {formatOfferTerms(item.offer) && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: '360px', textAlign: 'right' }}>
                                {formatOfferTerms(item.offer)}
                              </span>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSpeakText(item.reason)}
                          title="Listen to message audio"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1.1rem',
                            color: 'var(--text-muted)',
                            padding: '2px 4px',
                          }}
                        >
                          🔊
                        </button>
                      </div>
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: '1rem',
                        lineHeight: '1.6',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {item.reason}
                    </p>

                    {item.concession && item.concession.previousValue !== null && (
                      <div
                        style={{
                          marginTop: '10px',
                          paddingTop: '10px',
                          borderTop: '1px solid var(--border-color)',
                          fontSize: '0.85rem',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          gap: '14px',
                          fontWeight: 600,
                        }}
                      >
                        <span>
                          Concession: {currency}
                          {item.concession.concessionAmount.toLocaleString()} (
                          {item.concession.concessionPercentage}%)
                        </span>
                        <span
                          style={{
                            color:
                              item.concession.direction === CONCESSION_DIRECTION.DECREASE
                                ? 'var(--primary-brand)'
                                : 'var(--success-color)',
                            fontWeight: 800,
                          }}
                        >
                          [{item.concession.direction}]
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Live Thinking Indicator Bubble */}
            {isAiThinking && (
              <div
                className="chat-bubble-row left-row"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    marginBottom: '6px',
                    fontSize: '0.85rem',
                    color: 'var(--primary-brand)',
                  }}
                >
                  <strong style={{ fontWeight: 800 }}>🤖 {thinkingAgent || 'AI Agent'}</strong>
                  <span>• Analyzing & formulating proposal...</span>
                </div>
                <div
                  style={{
                    padding: '16px 22px',
                    borderRadius: '16px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--primary-brand)',
                    color: 'var(--primary-brand)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <span className="pulsing-indicator cyan" />
                  <span>
                    Generating persona-based strategic negotiation response
                  </span>
                  <div className="thinking-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}

            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      {/* Real-Time AI Negotiation Coach Panel */}
      <AICoachPanel
        state={state}
        onApplySuggestion={async (suggestion) => {
          if (mode === NEGOTIATION_MODE.SIMULATION) {
            try {
              setError(null);
              const newState = await NegotiationApi.applyCoachStrategy(
                negotiationId,
                currentAgentTurn,
                suggestion.strategy
              );
              onStateChange(newState);
            } catch (err) {
              setError(err?.message || 'Could not apply AI strategy override.');
            }
            return;
          }
          setHumanValue(suggestion.value);
          setHumanReason(suggestion.description);
          setHumanDecisionType(DECISION_TYPE.COUNTEROFFER);
        }}
      />

      {/* Human Participant Interactive Console */}
      {negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS && (
        <div
          style={{
            background: 'var(--bg-card)',
            border: isHumanTurn ? '2px solid var(--purple-accent)' : '1px solid var(--border-color)',
            borderRadius: '18px',
            padding: '28px',
            marginBottom: '24px',
            boxShadow: isHumanTurn ? '0 0 24px rgba(124, 58, 237, 0.18)' : 'var(--shadow-sm)',
            opacity: isHumanTurn ? 1 : 0.75,
            transition: 'all 0.3s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '18px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span
                  style={{
                    background: isHumanTurn ? 'var(--purple-accent)' : 'var(--bg-secondary)',
                    color: isHumanTurn ? '#ffffff' : 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    padding: '4px 12px',
                    borderRadius: '14px',
                    textTransform: 'uppercase',
                  }}
                >
                  {isHumanTurn ? '🟢 YOUR TURN TO RESPOND' : '⏳ AI THINKING — PLEASE WAIT'}
                </span>
                <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                  Role: <strong style={{ color: 'var(--text-primary)' }}>{humanAgentId}</strong> ({humanAgentObj?.role})
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                🎯 Goal: <strong style={{ color: 'var(--text-secondary)' }}>{humanAgentObj?.goal}</strong> | ⚠️ Constraint:{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>{humanAgentObj?.constraint}</strong>
              </p>
            </div>

            {currentOffer ? (
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Current Offer to Evaluate:
                </span>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary-brand)' }}>
                  {currency}
                  {currentOffer.value.toLocaleString()}
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Proposed by {currentOffer.agentId}
                </span>
              </div>
            ) : (
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.95rem', color: 'var(--primary-brand)', fontWeight: 700 }}>
                  Opening Round: Submit initial offer
                </span>
              </div>
            )}
          </div>

          {isHumanTurn && humanDecisionType === DECISION_TYPE.COUNTEROFFER && multiTermDefinitions.length > 0 && (
            <div style={{ margin: '18px 0', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '12px' }}>
                Negotiation Package — adjust secondary terms
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                {multiTermDefinitions.map((definition) => (
                  <label key={definition.name} style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {definition.label}
                    {Array.isArray(definition.options) ? (
                      <select
                        value={humanTerms[definition.name] ?? definition.default}
                        onChange={(e) => setHumanTerms((prev) => ({ ...prev, [definition.name]: e.target.value }))}
                        style={{ padding: '9px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      >
                        {definition.options.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input
                        type="number"
                        min={definition.min}
                        max={definition.max}
                        value={humanTerms[definition.name] ?? definition.default}
                        onChange={(e) => setHumanTerms((prev) => ({ ...prev, [definition.name]: Number(e.target.value) }))}
                        style={{ padding: '9px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleHumanSubmit}>
            {/* Action Buttons: Counteroffer / Accept / Reject */}
            <div style={{ display: 'flex', gap: '14px', marginBottom: '18px' }}>
              <button
                type="button"
                className="btn"
                disabled={!isHumanTurn}
                onClick={() => setHumanDecisionType(DECISION_TYPE.COUNTEROFFER)}
                style={{
                  flex: 1,
                  padding: '13px',
                  borderRadius: '10px',
                  cursor: isHumanTurn ? 'pointer' : 'not-allowed',
                  background:
                    humanDecisionType === DECISION_TYPE.COUNTEROFFER ? 'var(--purple-accent)' : 'var(--bg-secondary)',
                  border: `1px solid ${
                    humanDecisionType === DECISION_TYPE.COUNTEROFFER ? 'var(--purple-accent)' : 'var(--border-color)'
                  }`,
                  color:
                    humanDecisionType === DECISION_TYPE.COUNTEROFFER ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                }}
              >
                📝 {currentOffer ? 'Submit Counteroffer' : 'Propose Opening Offer'}
              </button>

              {currentOffer && (
                <button
                  type="button"
                  className="btn"
                  disabled={!isHumanTurn}
                  onClick={() => setHumanDecisionType(DECISION_TYPE.ACCEPT)}
                  style={{
                    flex: 1,
                    padding: '13px',
                    borderRadius: '10px',
                    cursor: isHumanTurn ? 'pointer' : 'not-allowed',
                    background:
                      humanDecisionType === DECISION_TYPE.ACCEPT ? 'var(--success-color)' : 'transparent',
                    border: '1px solid var(--success-color)',
                    color:
                      humanDecisionType === DECISION_TYPE.ACCEPT ? '#ffffff' : 'var(--success-color)',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                  }}
                >
                  ✅ Accept Offer ({currency}
                  {currentOffer.value.toLocaleString()})
                </button>
              )}

              {currentOffer && (
                <button
                  type="button"
                  className="btn"
                  disabled={!isHumanTurn}
                  onClick={() => setHumanDecisionType(DECISION_TYPE.REJECT)}
                  style={{
                    flex: 1,
                    padding: '13px',
                    borderRadius: '10px',
                    cursor: isHumanTurn ? 'pointer' : 'not-allowed',
                    background:
                      humanDecisionType === DECISION_TYPE.REJECT ? 'var(--danger-color)' : 'transparent',
                    border: '1px solid var(--danger-color)',
                    color:
                      humanDecisionType === DECISION_TYPE.REJECT ? '#ffffff' : 'var(--danger-color)',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                  }}
                >
                  ❌ Reject & Walk Away
                </button>
              )}
            </div>

            {/* Unique Feature 2: Tactical Counteroffer Quick-Fill Chips */}
            {humanDecisionType === DECISION_TYPE.COUNTEROFFER && currentOffer && (
              <div style={{ marginBottom: '16px', background: 'var(--bg-secondary)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary-brand)', marginBottom: '8px', textTransform: 'uppercase' }}>
                  ⚡ Smart Tactical Counteroffer Suggestions (1-Click Fill)
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={!isHumanTurn}
                    onClick={() => handleApplyTacticalChip('aggressive')}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--purple-accent)',
                      color: 'var(--purple-accent)',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: isHumanTurn ? 'pointer' : 'not-allowed',
                    }}
                  >
                    🎯 Aggressive Anchor
                  </button>
                  <button
                    type="button"
                    disabled={!isHumanTurn}
                    onClick={() => handleApplyTacticalChip('fair')}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--primary-brand)',
                      color: 'var(--primary-brand)',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: isHumanTurn ? 'pointer' : 'not-allowed',
                    }}
                  >
                    ⚖️ 50/50 Midpoint
                  </button>
                  <button
                    type="button"
                    disabled={!isHumanTurn}
                    onClick={() => handleApplyTacticalChip('soft')}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--success-color)',
                      color: 'var(--success-color)',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: isHumanTurn ? 'pointer' : 'not-allowed',
                    }}
                  >
                    🛡️ Soft Concession
                  </button>
                </div>
              </div>
            )}

            {/* Offer Value Input */}
            {humanDecisionType === DECISION_TYPE.COUNTEROFFER && (
              <div style={{ marginBottom: '18px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '8px',
                    fontWeight: 800,
                  }}
                >
                  PROPOSED {unit.toUpperCase()} VALUE ({currency}) *
                </label>
                <input
                  type="number"
                  disabled={!isHumanTurn}
                  placeholder={`Enter your ${unit.toLowerCase()} proposal (e.g. 85000)`}
                  value={humanValue}
                  onChange={(e) => setHumanValue(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    borderRadius: '10px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '1.05rem',
                    outline: 'none',
                    cursor: isHumanTurn ? 'text' : 'not-allowed',
                    fontWeight: 600,
                  }}
                  required
                />
              </div>
            )}

            {/* Reasoning / Message Input */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 800,
                  }}
                >
                  NEGOTIATION ARGUMENT & NATURAL LANGUAGE MESSAGE
                </label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <select
                    value={selectedLang}
                    onChange={(e) => setSelectedLang(e.target.value)}
                    style={{
                      background: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  >
                    <option value="en">English (US)</option>
                    <option value="te">Telugu (తెలుగు)</option>
                    <option value="hi">Hindi (हिन्दी)</option>
                  </select>
                  <button
                    type="button"
                    disabled={!isHumanTurn || isListening}
                    onClick={handleStartListening}
                    style={{
                      background: isListening ? 'var(--danger-color)' : 'var(--bg-secondary)',
                      color: isListening ? '#ffffff' : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      padding: '5px 12px',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: isHumanTurn ? 'pointer' : 'not-allowed',
                    }}
                  >
                    🎤 {isListening ? 'Listening...' : 'Voice Input'}
                  </button>
                </div>
              </div>
              <textarea
                disabled={!isHumanTurn}
                placeholder={
                  humanDecisionType === DECISION_TYPE.ACCEPT
                    ? 'Optional: Confirm rationale for accepting the proposal...'
                    : humanDecisionType === DECISION_TYPE.REJECT
                    ? 'Optional: Explain why the terms were unacceptable...'
                    : 'Explain the reasoning behind your proposal to persuade the AI counterpart...'
                }
                value={humanReason}
                onChange={(e) => setHumanReason(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '1rem',
                  resize: 'vertical',
                  outline: 'none',
                  cursor: isHumanTurn ? 'text' : 'not-allowed',
                  lineHeight: '1.5',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
              <button
                type="submit"
                className="btn"
                disabled={!isHumanTurn || (humanDecisionType === DECISION_TYPE.COUNTEROFFER && !humanValue)}
                style={{
                  padding: '12px 28px',
                  fontSize: '0.95rem',
                  borderRadius: '8px',
                  cursor:
                    isHumanTurn && (humanDecisionType !== DECISION_TYPE.COUNTEROFFER || humanValue)
                      ? 'pointer'
                      : 'not-allowed',
                  background:
                    humanDecisionType === DECISION_TYPE.ACCEPT
                      ? '#10b981'
                      : humanDecisionType === DECISION_TYPE.REJECT
                      ? '#ef4444'
                      : '#8b5cf6',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 700,
                  opacity:
                    isHumanTurn && (humanDecisionType !== DECISION_TYPE.COUNTEROFFER || humanValue)
                      ? 1
                      : 0.5,
                  transition: 'all 0.2s ease',
                }}
              >
                {humanDecisionType === DECISION_TYPE.ACCEPT
                  ? 'Accept & Settle Deal ✅'
                  : humanDecisionType === DECISION_TYPE.REJECT
                  ? 'Reject & Walk Away ❌'
                  : 'Send Proposal to AI →'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Control Actions & Simulation Toolbar */}
      <div
        className="engine-controls"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '14px',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-card)',
          padding: '16px 24px',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          {mode === NEGOTIATION_MODE.SIMULATION ? (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                className="btn btn-primary"
                onClick={handleTogglePause}
                disabled={negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS}
                style={{
                  padding: '12px 20px',
                  borderRadius: '10px',
                  cursor: negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS ? 'pointer' : 'not-allowed',
                  background: isPaused ? 'var(--primary-brand)' : '#f59e0b',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                }}
              >
                {isPaused ? '▶ Resume Auto-Play' : '⏸ Pause Auto-Play'}
              </button>
              <button
                className="btn btn-outline-sm"
                onClick={handleManualStepTurn}
                disabled={negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS || isAiThinking}
                style={{ padding: '11px 16px', borderRadius: '9px', fontWeight: 700 }}
              >
                ⚡ Step Now
              </button>
            </div>
          ) : (
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Mode: <strong style={{ color: 'var(--purple-accent)', fontWeight: 800 }}>Interactive Practice (Human vs AI)</strong>
            </span>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>Speed:</span>
            <select
              value={autoSpeed}
              onChange={(e) => setAutoSpeed(Number(e.target.value))}
              style={{
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value={800}>Fast (0.8s)</option>
              <option value={1500}>Normal (1.5s)</option>
              <option value={2500}>Slow (2.5s)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className="btn btn-outline-sm"
            onClick={handleInspectAgentInput}
            style={{
              padding: '10px 18px',
              borderRadius: '9px',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
            }}
          >
            🔍 Inspect LLM Payload
          </button>
        </div>
      </div>

      {/* Modal for Inspecting Agent Input Structure */}
      {showAgentInputModal && agentInputData && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '20px',
          }}
        >
          <div
            className="modal-content"
            style={{
              background: 'var(--bg-card)',
              padding: '28px',
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.35rem', color: 'var(--text-primary)', fontWeight: 800 }}>
                Standard LLM Agent Input Payload
              </h3>
              <button
                onClick={() => setShowAgentInputModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '18px' }}>
              Standard payload format constructed by the Orchestrator for the active agent turn.
            </p>
            <pre
              style={{
                background: 'var(--bg-secondary)',
                padding: '18px',
                borderRadius: '10px',
                fontSize: '0.875rem',
                overflowX: 'auto',
                color: 'var(--primary-brand)',
                border: '1px solid var(--border-color)',
                lineHeight: '1.5',
              }}
            >
              {JSON.stringify(agentInputData, null, 2)}
            </pre>
            <div style={{ textAlign: 'right', marginTop: '20px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowAgentInputModal(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '9px',
                  cursor: 'pointer',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                }}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outcome Report Modal */}
      {showOutcomeReportModal && outcomeReport && (
        <OutcomeReportModal
          report={outcomeReport}
          onClose={() => setShowOutcomeReportModal(false)}
        />
      )}
    </div>
  );
}
