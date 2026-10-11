import { describe, it, expect } from 'vitest';
import { scenarios } from '../constants/scenarios';
import { NEGOTIATION_STATUS, DECISION_TYPE } from '../constants/negotiationConstants';
import { createNegotiationState } from '../models/NegotiationState';
import { createAgentInput } from '../models/AgentInput';
import { generate_agent_response } from '../services/LLMIntegrationInterface';
import { NegotiationOrchestrator } from '../services/NegotiationOrchestrator';
import { NegotiationApi } from '../services/NegotiationApi';

describe('Milestone 2 - Task 1: Orchestrator Agent & State Management Foundation', () => {
  const vendorScenario = scenarios.vendor;
  const agentConfigs = {
    Buyer: 'Aggressive',
    Vendor: 'Collaborative',
  };

  describe('1. Negotiation State Model', () => {
    it('creates state model with mandatory fields including round, turn, offers, decisions, and history', () => {
      const state = createNegotiationState({
        scenario: vendorScenario,
        agentConfigs,
      });

      expect(state).toHaveProperty('negotiationId');
      expect(state.negotiationId).toMatch(/^neg_/);
      expect(state.currentRound).toBe(1);
      expect(state.currentAgentTurn).toBe('Buyer');
      expect(state.previousOffer).toBeNull();
      expect(state.currentOffer).toBeNull();
      expect(state.negotiationStatus).toBe(NEGOTIATION_STATUS.IN_PROGRESS);
      expect(state.agentGoals.Buyer).toBe(vendorScenario.agents[0].goal);
      expect(state.agentConstraints.Vendor).toBe(vendorScenario.agents[1].constraint);
      expect(state.agentPersonality.Buyer).toBe('Aggressive');
      expect(state.agentOffers).toEqual({});
      expect(state.counterOffers).toEqual([]);
      expect(state.decisions).toEqual([]);
      expect(state.negotiationHistory).toEqual([]);
      expect(state).toHaveProperty('createdAt');
      expect(state).toHaveProperty('updatedAt');
    });
  });

  describe('2. Standard Agent Input Structure', () => {
    it('constructs agent input containing persona, role, goals, constraints, state, history, and opponent offer', () => {
      const state = createNegotiationState({ scenario: vendorScenario, agentConfigs });
      
      const mockHistory = [
        {
          round: 1,
          agent: 'Buyer',
          action: 'OFFER',
          offer: { value: 90000, terms: 'Opening terms' },
          reason: 'Initial offer',
          timestamp: new Date().toISOString(),
        },
      ];

      const agentInput = createAgentInput({
        agentId: 'Vendor',
        scenario: vendorScenario,
        agentGoals: state.agentGoals,
        agentConstraints: state.agentConstraints,
        agentPersonality: state.agentPersonality,
        negotiationState: state,
        history: mockHistory,
        opponentOffer: mockHistory[0].offer,
      });

      expect(agentInput.agentId).toBe('Vendor');
      expect(agentInput.persona).toBe('Collaborative');
      expect(agentInput.role).toBe('Shopkeeper');
      expect(agentInput.goals).toBe('Maximize profit');
      expect(agentInput.constraints).toBe('Minimum acceptable price');
      expect(agentInput.negotiationState.currentRound).toBe(1);
      expect(agentInput.history).toHaveLength(1);
      expect(agentInput.previousConversation).toHaveLength(1);
      expect(agentInput.opponentOffer.value).toBe(90000);
    });
  });

  describe('3. LLM Integration Interface', () => {
    it('exposes generate_agent_response function returning decision, reason, counterOffer structure', () => {
      const state = createNegotiationState({ scenario: vendorScenario, agentConfigs });
      
      const agentInput = createAgentInput({
        agentId: 'Buyer',
        scenario: vendorScenario,
        agentGoals: state.agentGoals,
        agentConstraints: state.agentConstraints,
        agentPersonality: state.agentPersonality,
        negotiationState: state,
        history: [],
        opponentOffer: null,
      });

      const response = generate_agent_response(agentInput, state, []);

      expect(response).toHaveProperty('decision');
      expect(response).toHaveProperty('reason');
      expect(response).toHaveProperty('counterOffer');
      expect(response.isMockResponse).toBe(true);
      expect([DECISION_TYPE.ACCEPT, DECISION_TYPE.REJECT, DECISION_TYPE.COUNTEROFFER]).toContain(response.decision);
    });
  });

  describe('4. Multi-Round Negotiation Flow (Vendor Pricing Scenario)', () => {
    it('executes at least 3-5 rounds verifying turn order, round count, offer storage, history, and status', () => {
      const orchestrator = new NegotiationOrchestrator();
      let state = orchestrator.startNegotiation(vendorScenario, {
        Buyer: 'Aggressive',
        Vendor: 'Collaborative',
      });

      expect(state.currentRound).toBe(1);
      expect(state.currentAgentTurn).toBe('Buyer');
      expect(state.negotiationStatus).toBe(NEGOTIATION_STATUS.IN_PROGRESS);

      let stepCount = 0;
      const maxStepsAllowed = 15; // Prevent infinite loop in test

      while (state.negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS && stepCount < maxStepsAllowed) {
        stepCount++;
        const turnBefore = state.currentAgentTurn;

        state = orchestrator.executeTurnStep();

        // Verify history grew
        expect(state.negotiationHistory.length).toBe(stepCount);

        // Verify latest event agent matches turnBefore
        const latestHistory = state.negotiationHistory[state.negotiationHistory.length - 1];
        expect(latestHistory.agent).toBe(turnBefore);
      }

      // Verify that at least 3 negotiation rounds were executed or agreement reached
      expect(state.negotiationHistory.length).toBeGreaterThanOrEqual(5);

      // Verify complete history maintained
      expect(state.negotiationHistory.length).toBe(stepCount);
      state.negotiationHistory.forEach((entry) => {
        expect(entry).toHaveProperty('round');
        expect(entry).toHaveProperty('agent');
        expect(entry).toHaveProperty('action');
        expect(entry).toHaveProperty('reason');
        expect(entry).toHaveProperty('timestamp');
      });

      // Verify offers and counteroffers stored in state
      expect(Object.keys(state.agentOffers).length).toBeGreaterThan(0);
      expect(state.decisions.length).toBeGreaterThan(0);

      // Verify negotiation status updated correctly (AGREEMENT, DEADLOCK, or REJECTED)
      expect([NEGOTIATION_STATUS.AGREEMENT, NEGOTIATION_STATUS.DEADLOCK, NEGOTIATION_STATUS.REJECTED]).toContain(state.negotiationStatus);
    });
  });

  describe('5. Orchestrator API End-to-End Integration', () => {
    it('creates negotiation session and retrieves formatted AgentInput for active turn', () => {
      const state = NegotiationApi.createNegotiation(vendorScenario, agentConfigs);
      const negId = state.negotiationId;

      const agentInput = NegotiationApi.getAgentInput(negId);
      expect(agentInput.agentId).toBe('Buyer');
      expect(agentInput.persona).toBe('Aggressive');
      expect(agentInput.role).toBe('Customer');

      // Execute turn step via API
      const updatedState = NegotiationApi.executeTurn(negId);
      expect(updatedState.negotiationHistory).toHaveLength(1);
      expect(updatedState.currentAgentTurn).toBe('Vendor');
    });
  });
});
