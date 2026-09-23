import { RuleBasedDecisionService } from './RuleBasedDecisionService';
import { createAgentInput } from '../models/AgentInput';

/**
 * LLM Integration Interface for NegoForge Agents.
 * Standardized function signature for generating contextually reasoned agent responses.
 */

/**
 * Generates an agent response (OFFER, COUNTEROFFER, ACCEPT, or REJECT) with persona reasoning & stance.
 *
 * @param {Object} agentProfile - Standard agent input or profile object
 * @param {Object} negotiationState - Current negotiation state
 * @param {Array} history - Full negotiation history
 * @returns {Object} { decision, reason, counterOffer, stance, agentInputUsed, isMockResponse }
 */
export function generate_agent_response(agentProfile, negotiationState, history = []) {
  const input = agentProfile.persona
    ? agentProfile
    : createAgentInput({
        agentId: agentProfile.id || agentProfile.agentId || negotiationState.currentAgentTurn,
        scenario: negotiationState.scenario,
        agentGoals: negotiationState.agentGoals,
        agentConstraints: negotiationState.agentConstraints,
        agentPersonality: negotiationState.agentPersonality,
        negotiationState,
        history: history.length ? history : negotiationState.negotiationHistory,
        opponentOffer: negotiationState.currentOffer,
      });

  const agentId = input.agentId;
  const scenario = negotiationState.scenario;
  const currentOffer = negotiationState.currentOffer;
  const previousOffer = negotiationState.previousOffer;
  const currentRound = negotiationState.currentRound;

  const result = RuleBasedDecisionService.evaluateOffer({
    scenario,
    agentId,
    agentGoal: input.goals,
    agentConstraint: input.constraints,
    agentPersonality: input.persona,
    currentOffer,
    previousOffer,
    currentRound,
  });

  return {
    decision: result.decision,
    reason: result.reason,
    counterOffer: result.counterOffer,
    stance: result.stance || 'Moderate',
    agentInputUsed: input,
    isMockResponse: true,
  };
}

export const generateAgentResponse = generate_agent_response;
