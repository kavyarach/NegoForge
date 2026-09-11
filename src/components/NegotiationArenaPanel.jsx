import { useState } from 'react';
import { NegotiationApi } from '../services/NegotiationApi';
import { NEGOTIATION_STATUS, CONCESSION_DIRECTION, NEGOTIATION_MODE, DECISION_TYPE, STANCE_TYPE } from '../constants/negotiationConstants';
import { OutcomeReportModal } from './OutcomeReportModal';

export function NegotiationArenaPanel({ state, onStateChange, onReset }) {
  const [humanValue, setHumanValue] = useState('');
  const [humanReason, setHumanReason] = useState('');
  const [humanDecisionType, setHumanDecisionType] = useState(DECISION_TYPE.COUNTEROFFER);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(1200);
  const [showAgentInputModal, setShowAgentInputModal] = useState(false);
  const [showOutcomeReportModal, setShowOutcomeReportModal] = useState(false);
  const [agentInputData, setAgentInputData] = useState(null);
  const [outcomeReport, setOutcomeReport] = useState(null);

  if (!state) return null;

  const {
    negotiationId,
    scenario,
    mode = NEGOTIATION_MODE.SIMULATION,
    humanAgentId,
    currentRound,
    currentAgentTurn,
    currentOffer,
    negotiationStatus,
    deadlockDetected,
    deadlockReason,
    agentGoals = {},
    agentPersonality = {},
    agentStances = {},
    negotiationHistory = [],
  } = state;

  const currency = scenario?.currencySymbol || '$';
  const unit = scenario?.unit || 'Amount';
  const isHumanTurn = mode === NEGOTIATION_MODE.PRACTICE && currentAgentTurn === humanAgentId && negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS;

  // Compute live metrics
  const agents = scenario?.agents || [];
  const agent1 = agents[0] ? (agents[0].id || agents[0].name) : 'Agent1';
  const agent2 = agents[1] ? (agents[1].id || agents[1].name) : 'Agent2';

  const initialVal1 = scenario?.initialOfferValue || 100000;
  const initialVal2 = agents[1]?.baselineTarget || 80000;
  const initialGap = Math.abs(initialVal1 - initialVal2);

  let currentGap = initialGap;
  if (currentOffer && state.previousOffer) {
    currentGap = Math.abs(currentOffer.value - state.previousOffer.value);
  } else if (currentOffer) {
    currentGap = Math.abs(currentOffer.value - initialVal2);
  }

  const gapReduction = initialGap > 0 ? Math.max(0, Math.min(100, Math.round(((initialGap - currentGap) / initialGap) * 100))) : 0;

  const handleStepTurn = () => {
    try {
      const newState = NegotiationApi.executeTurn(negotiationId);
      onStateChange(newState);
    } catch (err) {
      console.error('Turn execution error:', err);
    }
  };

  const handleAutoPlay = () => {
    if (isAutoPlaying) {
      setIsAutoPlaying(false);
      return;
    }
    setIsAutoPlaying(true);

    let currentState = state;
    const interval = setInterval(() => {
      if (currentState.negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) {
        clearInterval(interval);
        setIsAutoPlaying(false);
        return;
      }

      // If practice mode and human turn reached, pause auto play
      if (currentState.mode === NEGOTIATION_MODE.PRACTICE && currentState.currentAgentTurn === currentState.humanAgentId) {
        clearInterval(interval);
        setIsAutoPlaying(false);
        return;
      }

      try {
        currentState = NegotiationApi.executeTurn(negotiationId);
        onStateChange(currentState);
      } catch (err) {
        console.error('Auto play error:', err);
        clearInterval(interval);
        setIsAutoPlaying(false);
      }
    }, autoSpeed);
  };

  const handleHumanSubmit = (e) => {
    e.preventDefault();
    if (negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) return;

    try {
      let newState;
      if (humanDecisionType === DECISION_TYPE.ACCEPT) {
        newState = NegotiationApi.processDecision(negotiationId, {
          agentId: humanAgentId,
          decision: DECISION_TYPE.ACCEPT,
          reason: humanReason || `Human participant (${humanAgentId}) accepted the current offer of ${currency}${currentOffer?.value?.toLocaleString()}.`,
          stance: STANCE_TYPE.FLEXIBLE,
        });
      } else if (humanDecisionType === DECISION_TYPE.REJECT) {
        newState = NegotiationApi.processDecision(negotiationId, {
          agentId: humanAgentId,
          decision: DECISION_TYPE.REJECT,
          reason: humanReason || `Human participant (${humanAgentId}) rejected the proposal.`,
          stance: STANCE_TYPE.STUBBORN,
        });
      } else {
        if (!humanValue) return;
        const val = Number(humanValue);
        const counterOffer = {
          value: val,
          terms: `Human counteroffer of ${currency}${val.toLocaleString()} ${unit}`,
          agentId: humanAgentId,
          roundNumber: currentRound,
          reason: humanReason || `Human counter-proposal of ${currency}${val.toLocaleString()}`,
        };

        newState = NegotiationApi.processDecision(negotiationId, {
          agentId: humanAgentId,
          decision: DECISION_TYPE.COUNTEROFFER,
          reason: humanReason || counterOffer.reason,
          counterOffer,
          stance: STANCE_TYPE.MODERATE,
        });
      }

      onStateChange(newState);
      setHumanValue('');
      setHumanReason('');

      // If practice mode, automatically trigger AI counterpart turn step after a short pause
      if (newState.negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS && newState.currentAgentTurn !== humanAgentId) {
        setTimeout(() => {
          try {
            const aiStepState = NegotiationApi.executeTurn(negotiationId);
            onStateChange(aiStepState);
          } catch (err) {
            console.error('AI turn trigger error:', err);
          }
        }, 800);
      }
    } catch (err) {
      console.error('Human submit error:', err);
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
      case STANCE_TYPE.FIRM: return '#ef4444';
      case STANCE_TYPE.FLEXIBLE: return '#10b981';
      case STANCE_TYPE.YIELDING: return '#3b82f6';
      case STANCE_TYPE.STUBBORN: return '#9333ea';
      default: return '#f59e0b';
    }
  };

  return (
    <div className="negotiation-arena-wrapper" style={{ width: '100%' }}>
      {/* Header Bar */}
      <div className="arena-header" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#0f172a', padding: '20px 24px', borderRadius: '12px',
        border: '1px solid #1e293b', marginBottom: '20px'
      }}>
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
            <span className="badge badge-id" style={{ background: '#1e293b', color: '#38bdf8', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
              ID: {negotiationId}
            </span>
            <span style={{
              background: mode === NEGOTIATION_MODE.PRACTICE ? '#8b5cf6' : '#0284c7',
              color: '#fff', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600
            }}>
              {mode === NEGOTIATION_MODE.PRACTICE ? '👤 PRACTICE MODE (HUMAN VS AI)' : '🤖 SIMULATION MODE (AI VS AI)'}
            </span>
          </div>

          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#f8fafc' }}>
            Negotiation Arena — {scenario?.title}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#94a3b8' }}>
            Round <strong>{currentRound}</strong> / 5 | Active Turn: <strong style={{ color: '#60a5fa' }}>{currentAgentTurn || 'Concluded'}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className={`status-badge status-${negotiationStatus.toLowerCase()}`} style={{
            padding: '8px 16px', borderRadius: '20px', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase'
          }}>
            {negotiationStatus.replace('_', ' ')}
          </span>

          <button
            onClick={handleOpenOutcomeReport}
            className="btn btn-outline"
            style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer', background: 'rgba(56,189,248,0.1)', border: '1px solid #38bdf8', color: '#38bdf8' }}
          >
            📊 Outcome Report
          </button>

          <button className="reset-btn" onClick={onReset} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', background: '#334155', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Reset Setup
          </button>
        </div>
      </div>

      {/* Live Agent Stance & Metrics Panel */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px'
      }}>
        {/* Agent 1 Stance Card */}
        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
              {agent1} {humanAgentId === agent1 ? '(YOU)' : ''}
            </span>
            <span style={{
              fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
              background: getStanceBadgeColor(agentStances[agent1] || 'Moderate'), color: '#fff'
            }}>
              Stance: {agentStances[agent1] || 'Moderate'}
            </span>
          </div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
            {agentPersonality[agent1] || 'Collaborative'}
          </h4>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#cbd5e1' }}>Goal: {agentGoals[agent1]}</p>
          {state.agentConcessions && state.agentConcessions[agent1] !== undefined && (
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#38bdf8' }}>
              Cumulative Concession: <strong>{currency}{Number(state.agentConcessions[agent1]).toLocaleString()}</strong>
            </p>
          )}
        </div>

        {/* Agent 2 Stance Card */}
        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
              {agent2} {humanAgentId === agent2 ? '(YOU)' : ''}
            </span>
            <span style={{
              fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
              background: getStanceBadgeColor(agentStances[agent2] || 'Moderate'), color: '#fff'
            }}>
              Stance: {agentStances[agent2] || 'Moderate'}
            </span>
          </div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: '#f8fafc' }}>
            {agentPersonality[agent2] || 'Collaborative'}
          </h4>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#cbd5e1' }}>Goal: {agentGoals[agent2]}</p>
          {state.agentConcessions && state.agentConcessions[agent2] !== undefined && (
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#38bdf8' }}>
              Cumulative Concession: <strong>{currency}{Number(state.agentConcessions[agent2]).toLocaleString()}</strong>
            </p>
          )}
        </div>

        {/* Live Convergence & Gap Metric */}
        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
            Price Convergence
          </span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8' }}>
              Gap: {currency}{currentGap.toLocaleString()}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600 }}>
              {gapReduction}% Bridged
            </span>
          </div>
          <div style={{ background: '#0f172a', height: '6px', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
            <div style={{ width: `${gapReduction}%`, height: '100%', background: '#34d399', transition: 'width 0.4s ease' }} />
          </div>
        </div>

        {/* Current Active Offer Card */}
        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
            Current Offer on Table
          </span>
          {currentOffer ? (
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24' }}>
                {currency}{currentOffer.value.toLocaleString()}
              </div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                By {currentOffer.agentId} (Round {currentOffer.roundNumber})
              </span>
            </div>
          ) : (
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#94a3b8', italic: 'true' }}>No offer made yet</p>
          )}
        </div>
      </div>

      {/* Deadlock Detection Alert & Mediator Resolution Banner */}
      {deadlockDetected && negotiationStatus === NEGOTIATION_STATUS.DEADLOCK && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(185,28,28,0.25))',
          border: '1px solid #ef4444', borderRadius: '12px', padding: '20px', marginBottom: '24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
              DEADLOCK DETECTED
            </span>
            <h3 style={{ margin: '6px 0 4px 0', fontSize: '1.2rem', color: '#fca5a5' }}>
              Negotiation Stalled
            </h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#fecaca' }}>
              {deadlockReason || 'Neither party is making further concessions.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleResolveDeadlock}
              className="btn btn-primary"
              style={{ padding: '10px 20px', borderRadius: '8px', background: '#ef4444', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >
              ⚡ Apply Mediator Compromise
            </button>
          </div>
        </div>
      )}

      {/* Negotiation Arena Chat Transcript */}
      <div className="transcript-section" style={{
        background: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b', padding: '24px', marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            💬 Negotiation Transcript & Reasoning Log
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            {negotiationHistory.length} Exchanges Recorded
          </span>
        </div>

        {negotiationHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
            <p style={{ fontSize: '1.1rem', margin: '0 0 8px 0' }}>The negotiation has not started yet.</p>
            <p style={{ fontSize: '0.875rem', margin: 0 }}>
              {mode === NEGOTIATION_MODE.PRACTICE
                ? 'Click "Step Next Turn" or submit your first proposal below to open the negotiation.'
                : 'Click "Step Next Agent Turn" or "Run Multi-Round Flow" to begin.'}
            </p>
          </div>
        ) : (
          <div className="chat-transcript-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '500px', overflowY: 'auto', paddingRight: '8px' }}>
            {negotiationHistory.map((item, idx) => {
              const isAgent1 = item.agent === agent1;
              const isHuman = mode === NEGOTIATION_MODE.PRACTICE && item.agent === humanAgentId;

              return (
                <div
                  key={idx}
                  className={`chat-bubble-row ${isAgent1 ? 'left-row' : 'right-row'}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isAgent1 ? 'flex-start' : 'flex-end',
                    width: '100%'
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px', fontSize: '0.75rem', color: '#94a3b8' }}>
                    <strong style={{ color: isHuman ? '#a78bfa' : '#60a5fa' }}>
                      {isHuman ? '👤 YOU' : `🤖 ${item.agent}`}
                    </strong>
                    <span>• Round {item.round}</span>
                    {item.stance && (
                      <span style={{
                        background: getStanceBadgeColor(item.stance), color: '#fff',
                        padding: '1px 6px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 600
                      }}>
                        {item.stance}
                      </span>
                    )}
                    <span>• {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>

                  {/* Speech Bubble */}
                  <div className="speech-bubble" style={{
                    maxWidth: '80%', padding: '16px 20px', borderRadius: '16px',
                    background: isHuman
                      ? 'linear-gradient(135deg, #4c1d95, #5b21b6)'
                      : isAgent1
                      ? '#1e293b'
                      : '#0f2744',
                    border: `1px solid ${isHuman ? '#7c3aed' : isAgent1 ? '#334155' : '#1e3a8a'}`,
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)',
                    color: '#f8fafc'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{
                        fontWeight: 700, fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px',
                        background: item.action === 'ACCEPT' ? '#059669' : item.action === 'REJECT' ? '#dc2626' : '#2563eb',
                        color: '#fff', textTransform: 'uppercase'
                      }}>
                        {item.action || item.decision}
                      </span>

                      {item.offer && (
                        <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fbbf24' }}>
                          {currency}{item.offer.value.toLocaleString()}
                        </span>
                      )}
                    </div>

                    <p style={{ margin: 0, fontSize: '0.925rem', lineHeight: '1.5', color: '#e2e8f0' }}>
                      {item.reason}
                    </p>

                    {item.concession && item.concession.previousValue !== null && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <span>Concession: {currency}{item.concession.concessionAmount.toLocaleString()} ({item.concession.concessionPercentage}%)</span>
                        {item.concession.cumulativeConcession !== undefined && (
                          <span style={{ color: '#38bdf8' }}>Cumulative: {currency}{Number(item.concession.cumulativeConcession).toLocaleString()}</span>
                        )}
                        <span style={{ color: item.concession.direction === CONCESSION_DIRECTION.DECREASE ? '#60a5fa' : '#34d399' }}>
                          [{item.concession.direction}]
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Human Participant Interface (Practice Mode Input Box) */}
      {isHumanTurn && (
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b, #0f172a)',
          border: '2px solid #6366f1', borderRadius: '16px', padding: '24px', marginBottom: '24px',
          boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.3)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <span style={{ background: '#6366f1', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                YOUR TURN TO RESPOND
              </span>
              <h3 style={{ margin: '4px 0 0 0', fontSize: '1.25rem', color: '#fff' }}>
                Participate as {humanAgentId}
              </h3>
            </div>
            {currentOffer && (
              <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>
                Responding to: <strong style={{ color: '#fbbf24' }}>{currency}{currentOffer.value.toLocaleString()}</strong> by {currentOffer.agentId}
              </span>
            )}
          </div>

          <form onSubmit={handleHumanSubmit}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <button
                type="button"
                className={`btn ${humanDecisionType === DECISION_TYPE.COUNTEROFFER ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setHumanDecisionType(DECISION_TYPE.COUNTEROFFER)}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer' }}
              >
                📝 Submit Counteroffer
              </button>
              <button
                type="button"
                className={`btn ${humanDecisionType === DECISION_TYPE.ACCEPT ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setHumanDecisionType(DECISION_TYPE.ACCEPT)}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', background: humanDecisionType === DECISION_TYPE.ACCEPT ? '#10b981' : 'transparent', border: '1px solid #10b981', color: '#fff', cursor: 'pointer' }}
              >
                ✅ Accept Offer
              </button>
              <button
                type="button"
                className={`btn ${humanDecisionType === DECISION_TYPE.REJECT ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setHumanDecisionType(DECISION_TYPE.REJECT)}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', background: humanDecisionType === DECISION_TYPE.REJECT ? '#ef4444' : 'transparent', border: '1px solid #ef4444', color: '#fff', cursor: 'pointer' }}
              >
                ❌ Reject Offer
              </button>
            </div>

            {humanDecisionType === DECISION_TYPE.COUNTEROFFER && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
                  PROPOSED {unit.toUpperCase()} VALUE ({currency})
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder={`Enter your ${unit.toLowerCase()} offer amount`}
                  value={humanValue}
                  onChange={(e) => setHumanValue(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: '8px', background: '#0f172a',
                    border: '1px solid #334155', color: '#fff', fontSize: '1rem'
                  }}
                  required
                />
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
                NEGOTIATION ARGUMENT & REASONING (SENT TO AI AGENT)
              </label>
              <textarea
                placeholder="Explain the rationale behind your offer or decision..."
                value={humanReason}
                onChange={(e) => setHumanReason(e.target.value)}
                rows={2}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: '8px', background: '#0f172a',
                  border: '1px solid #334155', color: '#fff', fontSize: '0.9rem', resize: 'vertical'
                }}
              />
            </div>

            <div style={{ textAlign: 'right' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: '12px 28px', fontSize: '0.95rem', borderRadius: '8px', cursor: 'pointer', background: '#6366f1', border: 'none', color: '#fff', fontWeight: 700 }}
              >
                Submit Decision to Arena →
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Control Actions & Simulation Toolbar */}
      <div className="engine-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleStepTurn}
            disabled={negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS || isAutoPlaying}
            style={{ padding: '12px 20px', borderRadius: '8px', cursor: 'pointer' }}
          >
            ⚡ Step Next Turn
          </button>

          {mode === NEGOTIATION_MODE.SIMULATION && (
            <button
              className="btn btn-secondary"
              onClick={handleAutoPlay}
              disabled={negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS}
              style={{ padding: '12px 20px', borderRadius: '8px', cursor: 'pointer' }}
            >
              {isAutoPlaying ? '⏸ Pause Auto Flow' : '▶ Run Multi-Round Flow'}
            </button>
          )}

          {mode === NEGOTIATION_MODE.SIMULATION && (
            <select
              value={autoSpeed}
              onChange={(e) => setAutoSpeed(Number(e.target.value))}
              style={{ background: '#1e293b', color: '#fff', border: '1px solid #334155', padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <option value={800}>Fast Speed (0.8s)</option>
              <option value={1500}>Normal Speed (1.5s)</option>
              <option value={2500}>Slow Speed (2.5s)</option>
            </select>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className="btn btn-outline-sm"
            onClick={handleInspectAgentInput}
            style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer', background: 'none', border: '1px solid #334155', color: '#94a3b8' }}
          >
            🔍 Inspect LLM Payload Structure
          </button>
        </div>
      </div>

      {/* Modal for Inspecting Agent Input Structure */}
      {showAgentInputModal && agentInputData && (
        <div className="modal-backdrop" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000, padding: '20px'
        }}>
          <div className="modal-content" style={{
            background: '#1e293b', padding: '24px', borderRadius: '12px', maxWidth: '650px', width: '100%',
            maxHeight: '80vh', overflowY: 'auto', border: '1px solid #334155', color: '#f8fafc'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Standard LLM Agent Input Payload</h3>
              <button
                onClick={() => setShowAgentInputModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '16px' }}>
              This standard payload format is constructed by the Orchestrator and passed into the LLM Reasoning Engine.
            </p>
            <pre style={{
              background: '#0f172a', padding: '16px', borderRadius: '8px', fontSize: '0.8rem',
              overflowX: 'auto', color: '#38bdf8', border: '1px solid #1e293b'
            }}>
              {JSON.stringify(agentInputData, null, 2)}
            </pre>
            <div style={{ textAlign: 'right', marginTop: '16px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowAgentInputModal(false)}
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
