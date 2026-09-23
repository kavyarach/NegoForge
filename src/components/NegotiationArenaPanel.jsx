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

export function NegotiationArenaPanel({ state, onStateChange, onReset }) {
  const [humanValue, setHumanValue] = useState('');
  const [humanReason, setHumanReason] = useState('');
  const [humanDecisionType, setHumanDecisionType] = useState(DECISION_TYPE.COUNTEROFFER);
  const [isPaused, setIsPaused] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(1500);
  const [error, setError] = useState(null);
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

  const agents = scenario?.agents || [];
  const agent1 = agents[0] ? (agents[0].id || agents[0].name) : 'Agent1';
  const agent2 = agents[1] ? (agents[1].id || agents[1].name) : 'Agent2';

  const isHumanTurn =
    mode === NEGOTIATION_MODE.PRACTICE &&
    currentAgentTurn === humanAgentId &&
    negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS;

  const isAiTurn =
    negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS &&
    (mode === NEGOTIATION_MODE.SIMULATION ? !isPaused : currentAgentTurn !== humanAgentId);

  const isAiThinking = isAiTurn && !error;
  const thinkingAgent = isAiThinking ? currentAgentTurn : null;

  const humanAgentObj = agents.find((a) => (a.id || a.name) === humanAgentId);

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

  // Auto-scroll transcript when new entries arrive or when thinking starts
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [negotiationHistory.length, isAiThinking]);

  // AUTOMATED TURN EXECUTION CONTROLLER
  useEffect(() => {
    if (!state || !isAiTurn || error) {
      return;
    }

    const timer = setTimeout(() => {
      if (turnInProgressRef.current) return;
      turnInProgressRef.current = true;

      try {
        const newState = NegotiationApi.executeTurn(negotiationId);
        turnInProgressRef.current = false;
        onStateChange(newState);
      } catch (err) {
        console.error('AI Turn execution error:', err);
        turnInProgressRef.current = false;
        setError('AI response could not be generated. Please retry.');
      }
    }, autoSpeed);

    return () => {
      clearTimeout(timer);
    };
  }, [
    state,
    isAiTurn,
    error,
    negotiationId,
    currentAgentTurn,
    currentRound,
    negotiationHistory.length,
    autoSpeed,
    onStateChange,
  ]);

  if (!state) return null;

  // Handle Manual Step Turn (if paused or debugging)
  const handleManualStepTurn = () => {
    if (negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS || turnInProgressRef.current) return;
    turnInProgressRef.current = true;
    setError(null);

    try {
      const newState = NegotiationApi.executeTurn(negotiationId);
      turnInProgressRef.current = false;
      onStateChange(newState);
    } catch (err) {
      console.error('Turn execution error:', err);
      turnInProgressRef.current = false;
      setError('AI response could not be generated. Please retry.');
    }
  };

  // Handle Retry after error
  const handleRetryAiTurn = () => {
    setError(null);
    handleManualStepTurn();
  };

  // Toggle Auto-Play Pause / Resume in Simulation Mode
  const handleTogglePause = () => {
    setIsPaused((prev) => !prev);
  };

  // Handle Human Submission in Practice Mode
  const handleHumanSubmit = (e) => {
    e.preventDefault();
    if (negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS || isAiThinking) return;

    try {
      setError(null);
      let newState;

      if (humanDecisionType === DECISION_TYPE.ACCEPT) {
        newState = NegotiationApi.processDecision(negotiationId, {
          agentId: humanAgentId,
          decision: DECISION_TYPE.ACCEPT,
          reason:
            humanReason ||
            `Human participant (${humanAgentId}) accepted the proposal of ${currency}${currentOffer?.value?.toLocaleString()}.`,
          stance: STANCE_TYPE.FLEXIBLE,
        });
      } else if (humanDecisionType === DECISION_TYPE.REJECT) {
        newState = NegotiationApi.processDecision(negotiationId, {
          agentId: humanAgentId,
          decision: DECISION_TYPE.REJECT,
          reason:
            humanReason ||
            `Human participant (${humanAgentId}) rejected the current proposal.`,
          stance: STANCE_TYPE.STUBBORN,
        });
      } else {
        // Counteroffer or opening offer
        if (!humanValue) return;
        const val = Number(humanValue);

        if (!currentOffer) {
          // Opening proposal
          newState = NegotiationApi.submitOffer(negotiationId, {
            agentId: humanAgentId,
            value: val,
            terms: `Human opening proposal of ${currency}${val.toLocaleString()} ${unit}`,
            reason:
              humanReason ||
              `Opening negotiation with a proposed ${unit.toLowerCase()} of ${currency}${val.toLocaleString()}.`,
          });
        } else {
          // Counteroffer
          const counterOffer = {
            value: val,
            terms: `Human counterproposal of ${currency}${val.toLocaleString()} ${unit}`,
            agentId: humanAgentId,
            roundNumber: currentRound,
            reason:
              humanReason ||
              `Human counter-proposal of ${currency}${val.toLocaleString()} in Round ${currentRound}.`,
          };

          newState = NegotiationApi.processDecision(negotiationId, {
            agentId: humanAgentId,
            decision: DECISION_TYPE.COUNTEROFFER,
            reason: humanReason || counterOffer.reason,
            counterOffer,
            stance: STANCE_TYPE.MODERATE,
          });
        }
      }

      onStateChange(newState);
      setHumanValue('');
      setHumanReason('');
    } catch (err) {
      console.error('Human submit error:', err);
      setError('Failed to submit offer. Please check values and try again.');
    }
  };

  const handleResolveDeadlock = () => {
    try {
      const newState = NegotiationApi.resolveDeadlock(negotiationId);
      onStateChange(newState);
    } catch (err) {
      console.error('Deadlock resolution error:', err);
    }
  };

  const handleInspectAgentInput = () => {
    try {
      const inputData = NegotiationApi.getAgentInput(negotiationId);
      setAgentInputData(inputData);
      setShowAgentInputModal(true);
    } catch (err) {
      console.error('Failed to get agent input:', err);
    }
  };

  const handleOpenOutcomeReport = () => {
    try {
      const report = NegotiationApi.getOutcomeReport(negotiationId);
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
        liveStatusText = currentAgentTurn ? `${currentAgentTurn.toUpperCase()} TURN` : 'AI TURN';
        liveStatusColor = '#38bdf8';
        liveStatusIndicatorClass = 'cyan';
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
          background: '#111827',
          padding: '20px 24px',
          borderRadius: '12px',
          border: '1px solid #263248',
          marginBottom: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
            <span
              className="badge badge-id"
              style={{
                background: '#0f172a',
                color: '#38bdf8',
                border: '1px solid #263248',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              ID: {negotiationId}
            </span>

            <span
              style={{
                background:
                  mode === NEGOTIATION_MODE.PRACTICE
                    ? 'rgba(139, 92, 246, 0.15)'
                    : 'rgba(56, 189, 248, 0.15)',
                border: `1px solid ${
                  mode === NEGOTIATION_MODE.PRACTICE ? '#8b5cf6' : '#38bdf8'
                }`,
                color: mode === NEGOTIATION_MODE.PRACTICE ? '#8b5cf6' : '#38bdf8',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              {mode === NEGOTIATION_MODE.PRACTICE
                ? '👤 PRACTICE MODE (AI VS HUMAN)'
                : '🤖 AUTONOMOUS SIMULATION (AI VS AI)'}
            </span>
          </div>

          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9' }}>
            Negotiation Arena — {scenario?.title}
          </h2>

          <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#a8b3c7' }}>
            Round <strong>{currentRound}</strong> / 5 | Active Turn:{' '}
            <strong
              style={{
                color:
                  mode === NEGOTIATION_MODE.PRACTICE && currentAgentTurn === humanAgentId
                    ? '#8b5cf6'
                    : '#38bdf8',
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

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Live Status Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '20px',
              background: '#0f172a',
              border: `1px solid ${liveStatusColor}`,
              color: liveStatusColor,
              fontWeight: 800,
              fontSize: '0.8rem',
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
            style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            📊 Outcome Report
          </button>

          <button
            className="btn btn-secondary"
            onClick={onReset}
            style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Reset Setup
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ color: '#fca5a5', fontSize: '0.9rem' }}>
            ⚠️ {error}
          </div>
          <button
            onClick={handleRetryAiTurn}
            className="btn"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#ef4444',
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: 700,
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {/* Agent 1 Stance Card */}
        <div
          style={{
            background: '#111827',
            padding: '16px',
            borderRadius: '12px',
            border: `1px solid ${
              mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent1
                ? '#8b5cf6'
                : '#263248'
            }`,
            boxShadow:
              mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent1
                ? '0 0 14px rgba(139, 92, 246, 0.15)'
                : 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <span
              style={{
                fontSize: '0.75rem',
                color:
                  mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent1
                    ? '#8b5cf6'
                    : '#a8b3c7',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {agent1}{' '}
              {mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent1
                ? '👤 (YOU)'
                : '🤖 (AI)'}
            </span>

            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '10px',
                background: getStanceBadgeColor(agentStances[agent1] || 'Moderate'),
                color: '#080b14',
              }}
            >
              Stance: {agentStances[agent1] || 'Moderate'}
            </span>
          </div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: '#f1f5f9' }}>
            {agentPersonality[agent1] || 'Collaborative'}
          </h4>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#a8b3c7' }}>
            Goal: {agentGoals[agent1]}
          </p>
        </div>

        {/* Agent 2 Stance Card */}
        <div
          style={{
            background: '#111827',
            padding: '16px',
            borderRadius: '12px',
            border: `1px solid ${
              mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent2
                ? '#8b5cf6'
                : '#263248'
            }`,
            boxShadow:
              mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent2
                ? '0 0 14px rgba(139, 92, 246, 0.15)'
                : 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <span
              style={{
                fontSize: '0.75rem',
                color:
                  mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent2
                    ? '#8b5cf6'
                    : '#a8b3c7',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {agent2}{' '}
              {mode === NEGOTIATION_MODE.PRACTICE && humanAgentId === agent2
                ? '👤 (YOU)'
                : '🤖 (AI)'}
            </span>

            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '10px',
                background: getStanceBadgeColor(agentStances[agent2] || 'Moderate'),
                color: '#080b14',
              }}
            >
              Stance: {agentStances[agent2] || 'Moderate'}
            </span>
          </div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: '#f1f5f9' }}>
            {agentPersonality[agent2] || 'Collaborative'}
          </h4>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#a8b3c7' }}>
            Goal: {agentGoals[agent2]}
          </p>
        </div>

        {/* Live Convergence & Gap Metric */}
        <div
          style={{
            background: '#111827',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #263248',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: '#a8b3c7',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Price Convergence
          </span>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '4px',
            }}
          >
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8' }}>
              Gap: {currency}
              {currentGap.toLocaleString()}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 700 }}>
              {gapReduction}% Bridged
            </span>
          </div>
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #263248',
              height: '8px',
              borderRadius: '4px',
              marginTop: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${gapReduction}%`,
                height: '100%',
                background: '#10b981',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Current Active Offer Card */}
        <div
          style={{
            background: '#111827',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #263248',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: '#a8b3c7',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Current Offer on Table
          </span>
          {currentOffer ? (
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8' }}>
                {currency}
                {currentOffer.value.toLocaleString()}
              </div>
              <span style={{ fontSize: '0.75rem', color: '#a8b3c7' }}>
                By {currentOffer.agentId} (Round {currentOffer.roundNumber})
              </span>
            </div>
          ) : (
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: '0.85rem',
                color: '#a8b3c7',
                fontStyle: 'italic',
              }}
            >
              Opening proposal pending...
            </p>
          )}
        </div>
      </div>

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
          background: '#111827',
          borderRadius: '16px',
          border: '1px solid #263248',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            borderBottom: '1px solid #263248',
            paddingBottom: '12px',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '1.2rem',
              color: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            💬 Negotiation Transcript & Reasoning Log
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#a8b3c7' }}>
            {negotiationHistory.length} Exchanges Recorded
          </span>
        </div>

        {negotiationHistory.length === 0 && !isAiThinking ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#a8b3c7' }}>
            <p style={{ fontSize: '1.1rem', margin: '0 0 8px 0', color: '#f1f5f9' }}>
              The negotiation has initialized.
            </p>
            <p style={{ fontSize: '0.875rem', margin: 0 }}>
              {mode === NEGOTIATION_MODE.PRACTICE
                ? currentAgentTurn === humanAgentId
                  ? 'Submit your opening proposal below to begin the negotiation.'
                  : 'AI is preparing the opening proposal...'
                : 'Autonomous AI simulation is starting automatically...'}
            </p>
          </div>
        ) : (
          <div
            className="chat-transcript-list"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
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
                      marginBottom: '4px',
                      fontSize: '0.75rem',
                      color: '#a8b3c7',
                    }}
                  >
                    <strong style={{ color: isHuman ? '#8b5cf6' : '#38bdf8' }}>
                      {isHuman ? `👤 YOU (${role || item.agent})` : `🤖 ${item.agent} (${role || ''})`}
                    </strong>
                    <span>• Round {item.round}</span>
                    {item.stance && (
                      <span
                        style={{
                          background: getStanceBadgeColor(item.stance),
                          color: '#080b14',
                          padding: '1px 6px',
                          borderRadius: '8px',
                          fontSize: '0.65rem',
                          fontWeight: 700,
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
                      maxWidth: '82%',
                      padding: '16px 20px',
                      borderRadius: '16px',
                      background: isHuman ? 'rgba(139, 92, 246, 0.12)' : '#0f172a',
                      border: `1px solid ${
                        isHuman
                          ? '#8b5cf6'
                          : isAgent1
                          ? '#263248'
                          : 'rgba(56, 189, 248, 0.35)'
                      }`,
                      boxShadow: isHuman
                        ? '0 4px 14px rgba(139, 92, 246, 0.15)'
                        : '0 4px 12px rgba(0, 0, 0, 0.25)',
                      color: '#f1f5f9',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                        gap: '16px',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background:
                            item.action === 'ACCEPT'
                              ? 'rgba(16, 185, 129, 0.2)'
                              : item.action === 'REJECT'
                              ? 'rgba(239, 68, 68, 0.2)'
                              : isHuman
                              ? 'rgba(139, 92, 246, 0.2)'
                              : 'rgba(56, 189, 248, 0.2)',
                          border: `1px solid ${
                            item.action === 'ACCEPT'
                              ? '#10b981'
                              : item.action === 'REJECT'
                              ? '#ef4444'
                              : isHuman
                              ? '#8b5cf6'
                              : '#38bdf8'
                          }`,
                          color:
                            item.action === 'ACCEPT'
                              ? '#10b981'
                              : item.action === 'REJECT'
                              ? '#ef4444'
                              : isHuman
                              ? '#8b5cf6'
                              : '#38bdf8',
                          textTransform: 'uppercase',
                        }}
                      >
                        {item.action || item.decision}
                      </span>

                      {item.offer && (
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '1.1rem',
                            color: isHuman ? '#a78bfa' : '#38bdf8',
                          }}
                        >
                          {currency}
                          {item.offer.value.toLocaleString()}
                        </span>
                      )}
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.925rem',
                        lineHeight: '1.5',
                        color: '#f1f5f9',
                      }}
                    >
                      {item.reason}
                    </p>

                    {item.concession && item.concession.previousValue !== null && (
                      <div
                        style={{
                          marginTop: '8px',
                          paddingTop: '8px',
                          borderTop: '1px solid #263248',
                          fontSize: '0.75rem',
                          color: '#a8b3c7',
                          display: 'flex',
                          gap: '12px',
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
                                ? '#38bdf8'
                                : '#10b981',
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
                    marginBottom: '4px',
                    fontSize: '0.75rem',
                    color: '#38bdf8',
                  }}
                >
                  <strong>🤖 {thinkingAgent || 'AI Agent'}</strong>
                  <span>• Analyzing & formulating proposal...</span>
                </div>
                <div
                  style={{
                    padding: '14px 20px',
                    borderRadius: '16px',
                    background: '#0f172a',
                    border: '1px solid #38bdf8',
                    color: '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '0.875rem',
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

      {/* Human Participant Interactive Console (Practice Mode) */}
      {mode === NEGOTIATION_MODE.PRACTICE && negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS && (
        <div
          style={{
            background: '#111827',
            border: isHumanTurn ? '2px solid #8b5cf6' : '1px solid #263248',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: isHumanTurn ? '0 0 20px rgba(139, 92, 246, 0.2)' : 'none',
            opacity: isHumanTurn ? 1 : 0.7,
            transition: 'all 0.3s ease',
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
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span
                  style={{
                    background: isHumanTurn ? '#8b5cf6' : '#263248',
                    color: isHumanTurn ? '#ffffff' : '#a8b3c7',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: '12px',
                    textTransform: 'uppercase',
                  }}
                >
                  {isHumanTurn ? '🟢 YOUR TURN TO RESPOND' : '⏳ AI THINKING — PLEASE WAIT'}
                </span>
                <span style={{ fontSize: '0.85rem', color: '#a8b3c7' }}>
                  Role: <strong>{humanAgentId}</strong> ({humanAgentObj?.role})
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#a8b3c7' }}>
                🎯 Goal: <strong>{humanAgentObj?.goal}</strong> | ⚠️ Constraint:{' '}
                <strong>{humanAgentObj?.constraint}</strong>
              </p>
            </div>

            {currentOffer ? (
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.8rem', color: '#a8b3c7' }}>
                  Current Offer to Evaluate:
                </span>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8' }}>
                  {currency}
                  {currentOffer.value.toLocaleString()}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#a8b3c7' }}>
                  Proposed by {currentOffer.agentId}
                </span>
              </div>
            ) : (
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600 }}>
                  Opening Round: Submit initial offer
                </span>
              </div>
            )}
          </div>

          <form onSubmit={handleHumanSubmit}>
            {/* Action Buttons: Counteroffer / Accept / Reject */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <button
                type="button"
                className="btn"
                disabled={!isHumanTurn}
                onClick={() => setHumanDecisionType(DECISION_TYPE.COUNTEROFFER)}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: '8px',
                  cursor: isHumanTurn ? 'pointer' : 'not-allowed',
                  background:
                    humanDecisionType === DECISION_TYPE.COUNTEROFFER ? '#8b5cf6' : '#0f172a',
                  border: `1px solid ${
                    humanDecisionType === DECISION_TYPE.COUNTEROFFER ? '#8b5cf6' : '#263248'
                  }`,
                  color:
                    humanDecisionType === DECISION_TYPE.COUNTEROFFER ? '#ffffff' : '#a8b3c7',
                  fontWeight: 700,
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
                    padding: '11px',
                    borderRadius: '8px',
                    cursor: isHumanTurn ? 'pointer' : 'not-allowed',
                    background:
                      humanDecisionType === DECISION_TYPE.ACCEPT ? '#10b981' : 'transparent',
                    border: '1px solid #10b981',
                    color:
                      humanDecisionType === DECISION_TYPE.ACCEPT ? '#ffffff' : '#10b981',
                    fontWeight: 700,
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
                    padding: '11px',
                    borderRadius: '8px',
                    cursor: isHumanTurn ? 'pointer' : 'not-allowed',
                    background:
                      humanDecisionType === DECISION_TYPE.REJECT ? '#ef4444' : 'transparent',
                    border: '1px solid #ef4444',
                    color:
                      humanDecisionType === DECISION_TYPE.REJECT ? '#ffffff' : '#ef4444',
                    fontWeight: 700,
                  }}
                >
                  ❌ Reject & Walk Away
                </button>
              )}
            </div>

            {/* Offer Value Input */}
            {humanDecisionType === DECISION_TYPE.COUNTEROFFER && (
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: '#a8b3c7',
                    marginBottom: '6px',
                    fontWeight: 700,
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
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: '#0f172a',
                    border: '1px solid #263248',
                    color: '#f1f5f9',
                    fontSize: '1rem',
                    outline: 'none',
                    cursor: isHumanTurn ? 'text' : 'not-allowed',
                  }}
                  required
                />
              </div>
            )}

            {/* Reasoning / Message Input */}
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  color: '#a8b3c7',
                  marginBottom: '6px',
                  fontWeight: 700,
                }}
              >
                NEGOTIATION ARGUMENT & MESSAGE (SENT TO AI AGENT)
              </label>
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
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: '#0f172a',
                  border: '1px solid #263248',
                  color: '#f1f5f9',
                  fontSize: '0.9rem',
                  resize: 'vertical',
                  outline: 'none',
                  cursor: isHumanTurn ? 'text' : 'not-allowed',
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
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#0f172a',
          padding: '14px 20px',
          borderRadius: '12px',
          border: '1px solid #263248',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {mode === NEGOTIATION_MODE.SIMULATION ? (
            <>
              <button
                className="btn btn-secondary"
                onClick={handleTogglePause}
                disabled={negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  cursor:
                    negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS ? 'pointer' : 'not-allowed',
                  background: isPaused ? '#10b981' : '#0f172a',
                  color: isPaused ? '#080b14' : '#f1f5f9',
                  border: `1px solid ${isPaused ? '#10b981' : '#263248'}`,
                  fontWeight: 700,
                }}
              >
                {isPaused ? '▶ Resume Auto Flow' : '⏸ Pause Auto Flow'}
              </button>

              {isPaused && (
                <button
                  className="btn btn-primary"
                  onClick={handleManualStepTurn}
                  disabled={negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS || isAiThinking}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  ⚡ Step 1 Turn
                </button>
              )}
            </>
          ) : (
            <span style={{ fontSize: '0.85rem', color: '#a8b3c7' }}>
              Mode: <strong style={{ color: '#8b5cf6' }}>Interactive Practice (Human vs AI)</strong>
            </span>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#a8b3c7' }}>Speed:</span>
            <select
              value={autoSpeed}
              onChange={(e) => setAutoSpeed(Number(e.target.value))}
              style={{
                background: '#111827',
                color: '#f1f5f9',
                border: '1px solid #263248',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
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
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: 'transparent',
              border: '1px solid #263248',
              color: '#a8b3c7',
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
            background: 'rgba(8, 11, 20, 0.85)',
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
              background: '#111827',
              padding: '24px',
              borderRadius: '12px',
              maxWidth: '650px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              border: '1px solid #263248',
              color: '#f1f5f9',
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
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#f1f5f9' }}>
                Standard LLM Agent Input Payload
              </h3>
              <button
                onClick={() => setShowAgentInputModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#a8b3c7',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#a8b3c7', marginBottom: '16px' }}>
              Standard payload format constructed by the Orchestrator for the active agent turn.
            </p>
            <pre
              style={{
                background: '#0f172a',
                padding: '16px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                overflowX: 'auto',
                color: '#38bdf8',
                border: '1px solid #263248',
              }}
            >
              {JSON.stringify(agentInputData, null, 2)}
            </pre>
            <div style={{ textAlign: 'right', marginTop: '16px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowAgentInputModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
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
