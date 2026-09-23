import { NegotiationOrchestrator } from './NegotiationOrchestrator';
import { OutcomeEvaluationService } from './OutcomeEvaluationService';
import { NEGOTIATION_MODE } from '../constants/negotiationConstants';

// In-memory registry to store active negotiations
const negotiationsRegistry = new Map();

/**
 * Backend API abstraction layer for NegoForge Negotiation Engine
 */
export const NegotiationApi = {
  /**
   * Create a new negotiation session.
   *
   * @param {Object} scenario - Selected scenario data
   * @param {Object} agentConfigs - Map of agentName -> personality string
   * @param {string} [mode=NEGOTIATION_MODE.SIMULATION] - SIMULATION (AI vs AI) or PRACTICE (Human vs AI)
   * @param {string|null} [humanAgentId=null] - ID of agent controlled by human if practice mode
   * @returns {Object} Newly created negotiation state
   */
  createNegotiation(scenario, agentConfigs, mode = NEGOTIATION_MODE.SIMULATION, humanAgentId = null) {
    const orchestrator = new NegotiationOrchestrator();
    const state = orchestrator.startNegotiation(scenario, agentConfigs, mode, humanAgentId);
    negotiationsRegistry.set(state.negotiationId, orchestrator);
    return state;
  },

  /**
   * Fetch current state of a negotiation by ID.
   *
   * @param {string} negotiationId
   * @returns {Object} Negotiation state
   */
  getNegotiationState(negotiationId) {
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) {
      throw new Error(`Negotiation session ${negotiationId} not found.`);
    }
    return orchestrator.getCurrentState();
  },

  /**
   * Fetch standard AgentInput payload formatted for current turn agent.
   *
   * @param {string} negotiationId
   * @returns {Object} AgentInput structure
   */
  getAgentInput(negotiationId) {
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) {
      throw new Error(`Negotiation session ${negotiationId} not found.`);
    }
    return orchestrator.getAgentInputForCurrentTurn();
  },

  /**
   * Submit an offer to the negotiation engine.
   *
   * @param {string} negotiationId
   * @param {Object} offerPayload - { agentId, value, terms, reason }
   * @returns {Object} Updated negotiation state
   */
  submitOffer(negotiationId, offerPayload) {
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) {
      throw new Error(`Negotiation session ${negotiationId} not found.`);
    }
    return orchestrator.processOffer(offerPayload);
  },

  /**
   * Submit a decision (ACCEPT, REJECT, COUNTEROFFER).
   *
   * @param {string} negotiationId
   * @param {Object} decisionPayload - { agentId, decision, reason, counterOffer, stance }
   * @returns {Object} Updated negotiation state
   */
  processDecision(negotiationId, decisionPayload) {
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) {
      throw new Error(`Negotiation session ${negotiationId} not found.`);
    }
    return orchestrator.processDecision(decisionPayload);
  },

  /**
   * Executes one automated turn step using LLM Integration / Reasoning Engine.
   *
   * @param {string} negotiationId
   * @returns {Object} Updated negotiation state
   */
  executeTurn(negotiationId) {
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) {
      throw new Error(`Negotiation session ${negotiationId} not found.`);
    }
    return orchestrator.executeTurnStep();
  },

  /**
   * Resolves deadlock using automated Mediator Compromise.
   *
   * @param {string} negotiationId
   * @returns {Object} Updated negotiation state
   */
  resolveDeadlock(negotiationId) {
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) {
      throw new Error(`Negotiation session ${negotiationId} not found.`);
    }
    return orchestrator.resolveDeadlockWithCompromise();
  },

  /**
   * Generates structured outcome analysis report.
   *
   * @param {string} negotiationId
   * @returns {Object} Structured Outcome Report
   */
  getOutcomeReport(negotiationId) {
    const state = this.getNegotiationState(negotiationId);
    return OutcomeEvaluationService.generateReport(state);
  },

  /**
   * Retrieves full negotiation history log.
   *
   * @param {string} negotiationId
   * @returns {Array} Array of history events
   */
  getNegotiationHistory(negotiationId) {
    const orchestrator = negotiationsRegistry.get(negotiationId);
    if (!orchestrator) {
      throw new Error(`Negotiation session ${negotiationId} not found.`);
    }
    return orchestrator.getNegotiationHistory();
  },
};
