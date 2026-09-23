import { NEGOTIATION_STATUS, NEGOTIATION_MODE } from '../constants/negotiationConstants';

/**
 * Standard Negotiation State Model.
 * Encapsulates the complete state structure of a negotiation session.
 */
export function createNegotiationState({
  scenario,
  agentConfigs = {},
  mode = NEGOTIATION_MODE.SIMULATION,
  humanAgentId = null,
}) {
  const timestamp = new Date().toISOString();
  const agents = scenario ? scenario.agents || [] : [];
  const firstAgent = agents[0] ? (agents[0].id || agents[0].name) : null;

  const agentGoals = {};
  const agentConstraints = {};
  const agentPersonality = {};
  const agentStances = {};

  agents.forEach((agent) => {
    const agentKey = agent.id || agent.name;
    agentGoals[agentKey] = agent.goal || '';
    agentConstraints[agentKey] = agent.constraint || '';
    agentPersonality[agentKey] = agentConfigs[agent.name] || agentConfigs[agent.id] || 'Collaborative';
    agentStances[agentKey] = 'Firm';
  });

  return {
    negotiationId: `neg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    scenario,
    mode, // SIMULATION (AI vs AI) or PRACTICE (Human vs AI)
    humanAgentId, // Agent ID controlled by Human when mode === PRACTICE
    currentRound: 1,
    currentAgentTurn: firstAgent,
    previousOffer: null,
    currentOffer: null,
    negotiationStatus: NEGOTIATION_STATUS.IN_PROGRESS,
    deadlockDetected: false,
    deadlockReason: null,
    agentGoals,
    agentConstraints,
    agentPersonality,
    agentStances,
    agentOffers: {}, // Stores latest offer by agent ID
    counterOffers: [], // Stores record of all counteroffers
    decisions: [], // Stores record of all decisions (ACCEPT/REJECT/COUNTEROFFER)
    negotiationHistory: [], // Complete timestamped history of conversation & decisions
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
