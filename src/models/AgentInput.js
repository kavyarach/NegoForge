/**
 * Standard Agent Input Structure for LLM / Reasoning Engine.
 * Formats context into a consistent prompt-ready payload.
 */
export function createAgentInput({
  agentId,
  scenario,
  agentGoals = {},
  agentConstraints = {},
  agentPersonality = {},
  negotiationState = {},
  history = [],
  opponentOffer = null,
}) {
  const agents = scenario ? scenario.agents || [] : [];
  const currentAgent = agents.find((a) => a.id === agentId || a.name === agentId) || {};

  const persona = agentPersonality[agentId] || 'Collaborative';
  const role = currentAgent.role || agentId;
  const goals = agentGoals[agentId] || currentAgent.goal || '';
  const constraints = agentConstraints[agentId] || currentAgent.constraint || '';

  // Extract previous conversation/history relevant to the agent
  const previousHistory = Array.isArray(history) ? [...history] : [];

  return {
    agentId,
    persona,
    role,
    goals,
    constraints,
    negotiationState: {
      negotiationId: negotiationState.negotiationId,
      currentRound: negotiationState.currentRound,
      currentAgentTurn: negotiationState.currentAgentTurn,
      negotiationStatus: negotiationState.negotiationStatus,
      scenarioTitle: scenario?.title || '',
      currencySymbol: scenario?.currencySymbol || '$',
    },
    history: previousHistory,
    previousConversation: previousHistory.map((item) => ({
      round: item.round,
      agent: item.agent,
      action: item.action || item.decision,
      offerValue: item.offer ? item.offer.value : null,
      reason: item.reason,
      timestamp: item.timestamp,
    })),
    opponentOffer: opponentOffer
      ? {
          offerId: opponentOffer.offerId,
          agentId: opponentOffer.agentId,
          value: opponentOffer.value,
          terms: opponentOffer.terms,
          roundNumber: opponentOffer.roundNumber,
          reason: opponentOffer.reason,
        }
      : null,
  };
}
