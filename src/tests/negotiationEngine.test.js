import { describe, it, expect } from 'vitest';
import { NEGOTIATION_STATUS, DECISION_TYPE, CONCESSION_DIRECTION } from '../constants/negotiationConstants';
import { scenarios } from '../constants/scenarios';
import { createOffer } from '../models/Offer';
import { calculateConcession } from '../services/ConcessionTracker';
import { RuleBasedDecisionService } from '../services/RuleBasedDecisionService';
import { NegotiationOrchestrator } from '../services/NegotiationOrchestrator';
import { NegotiationApi } from '../services/NegotiationApi';

describe('Milestone 1 - Negotiation Engine Foundation', () => {
  const mockScenario = scenarios.vendor;
  const mockAgentConfigs = {
    Buyer: 'Aggressive',
    Vendor: 'Collaborative',
  };

  describe('1. Negotiation State & Orchestrator Initialization', () => {
    it('creates negotiation state with all mandatory fields and initial values', () => {
      const orchestrator = new NegotiationOrchestrator();
      const state = orchestrator.startNegotiation(mockScenario, mockAgentConfigs);

      expect(state).toHaveProperty('negotiationId');
      expect(state.negotiationId).toMatch(/^neg_/);
      expect(state.scenario).toEqual(mockScenario);
      expect(state.currentRound).toBe(1);
      expect(state.currentAgentTurn).toBe('Buyer');
      expect(state.previousOffer).toBeNull();
      expect(state.currentOffer).toBeNull();
      expect(state.negotiationStatus).toBe(NEGOTIATION_STATUS.IN_PROGRESS);
      expect(state.agentGoals).toHaveProperty('Buyer');
      expect(state.agentConstraints).toHaveProperty('Buyer');
      expect(state.agentPersonality).toEqual(mockAgentConfigs);
      expect(state.negotiationHistory).toEqual([]);
      expect(state).toHaveProperty('createdAt');
      expect(state).toHaveProperty('updatedAt');
    });
  });

  describe('2. Standard Offer Structure', () => {
    it('creates a standard offer with required properties', () => {
      const offer = createOffer({
        value: 95000,
        terms: 'Payment in 30 days',
        agentId: 'Buyer',
        roundNumber: 1,
        reason: 'Initial discount request',
      });

      expect(offer).toHaveProperty('offerId');
      expect(offer.value).toBe(95000);
      expect(offer.terms).toBe('Payment in 30 days');
      expect(offer.agentId).toBe('Buyer');
      expect(offer.roundNumber).toBe(1);
      expect(offer.reason).toBe('Initial discount request');
      expect(offer).toHaveProperty('timestamp');
    });
  });

  describe('3. Concession Tracking', () => {
    it('calculates DECREASE concession correctly (e.g. ₹100,000 -> ₹95,000)', () => {
      const concession = calculateConcession(100000, 95000);

      expect(concession.previousValue).toBe(100000);
      expect(concession.currentValue).toBe(95000);
      expect(concession.concessionAmount).toBe(5000);
      expect(concession.concessionPercentage).toBe(5);
      expect(concession.direction).toBe(CONCESSION_DIRECTION.DECREASE);
    });

    it('calculates INCREASE concession correctly', () => {
      const concession = calculateConcession(80000, 88000);

      expect(concession.previousValue).toBe(80000);
      expect(concession.currentValue).toBe(88000);
      expect(concession.concessionAmount).toBe(8000);
      expect(concession.concessionPercentage).toBe(10);
      expect(concession.direction).toBe(CONCESSION_DIRECTION.INCREASE);
    });

    it('handles first offer with no previous value', () => {
      const concession = calculateConcession(null, 100000);

      expect(concession.previousValue).toBeNull();
      expect(concession.currentValue).toBe(100000);
      expect(concession.concessionAmount).toBe(0);
      expect(concession.concessionPercentage).toBe(0);
      expect(concession.direction).toBe(CONCESSION_DIRECTION.NO_CHANGE);
    });
  });

  describe('4. Rule-Based Decision Logic', () => {
    it('returns ACCEPT when offer meets target threshold', () => {
      const currentOffer = createOffer({
        value: 78000, // Below Buyer target of 80000 (good price)
        agentId: 'Vendor',
        roundNumber: 1,
      });

      const result = RuleBasedDecisionService.evaluateOffer({
        scenario: mockScenario,
        agentId: 'Buyer',
        agentGoal: 'Get best price',
        agentConstraint: 'Budget',
        agentPersonality: 'Collaborative',
        currentOffer,
        currentRound: 1,
      });

      expect(result.decision).toBe(DECISION_TYPE.ACCEPT);
      expect(result.reason).toContain('meets or exceeds target');
      expect(result.counterOffer).toBeNull();
    });

    it('returns REJECT when offer is far beyond reservation constraint', () => {
      const currentOffer = createOffer({
        value: 180000, // Extremely high offer well above Buyer reservation limit (110000)
        agentId: 'Vendor',
        roundNumber: 5,
      });

      const result = RuleBasedDecisionService.evaluateOffer({
        scenario: mockScenario,
        agentId: 'Buyer',
        agentGoal: 'Get best price',
        agentConstraint: 'Budget limit',
        agentPersonality: 'Aggressive',
        currentOffer,
        currentRound: 5,
        maxRounds: 5,
      });

      expect(result.decision).toBe(DECISION_TYPE.REJECT);
      expect(result.reason).toContain('violates constraint');
    });

    it('returns COUNTEROFFER with valid counterOffer structure when negotiation is in range', () => {
      const currentOffer = createOffer({
        value: 105000, // Above buyer target (80000), but within reservation (110000)
        agentId: 'Vendor',
        roundNumber: 1,
      });

      const result = RuleBasedDecisionService.evaluateOffer({
        scenario: mockScenario,
        agentId: 'Buyer',
        agentGoal: 'Get best price',
        agentConstraint: 'Budget',
        agentPersonality: 'Collaborative',
        currentOffer,
        currentRound: 1,
      });

      expect(result.decision).toBe(DECISION_TYPE.COUNTEROFFER);
      expect(result.counterOffer).not.toBeNull();
      expect(result.counterOffer.agentId).toBe('Buyer');
      expect(result.counterOffer.value).toBeLessThan(105000);
    });
  });

  describe('5. Turn Switching and Round Updates', () => {
    it('switches turn correctly between configured agents', () => {
      const orchestrator = new NegotiationOrchestrator();
      orchestrator.startNegotiation(mockScenario, mockAgentConfigs);

      expect(orchestrator.getCurrentState().currentAgentTurn).toBe('Buyer');
      const nextAgent = orchestrator.getNextAgent();
      expect(nextAgent).toBe('Vendor');

      orchestrator.switchTurn();
      expect(orchestrator.getCurrentState().currentAgentTurn).toBe('Vendor');
    });

    it('starts next round and resets turn to first agent', () => {
      const orchestrator = new NegotiationOrchestrator();
      orchestrator.startNegotiation(mockScenario, mockAgentConfigs);
      orchestrator.switchTurn(); // Turn is now Vendor

      const updatedState = orchestrator.startNextRound();
      expect(updatedState.currentRound).toBe(2);
      expect(updatedState.currentAgentTurn).toBe('Buyer');
    });
  });

  describe('6. Full Negotiation Orchestration & API', () => {
    it('runs end-to-end API operations (Create, State, Submit, Decision, History)', () => {
      // Create
      const state = NegotiationApi.createNegotiation(mockScenario, mockAgentConfigs);
      const negId = state.negotiationId;

      // Fetch state
      const fetchedState = NegotiationApi.getNegotiationState(negId);
      expect(fetchedState.negotiationId).toBe(negId);

      // Submit offer
      const offerState = NegotiationApi.submitOffer(negId, {
        agentId: 'Buyer',
        value: 90000,
        terms: 'Opening offer',
        reason: 'Budget constraint',
      });
      expect(offerState.currentOffer.value).toBe(90000);
      expect(offerState.currentAgentTurn).toBe('Vendor');

      // Process decision (ACCEPT)
      const finalState = NegotiationApi.processDecision(negId, {
        agentId: 'Vendor',
        decision: DECISION_TYPE.ACCEPT,
        reason: 'Price is reasonable',
      });
      expect(finalState.negotiationStatus).toBe(NEGOTIATION_STATUS.AGREEMENT);

      // Get history
      const history = NegotiationApi.getNegotiationHistory(negId);
      expect(history.length).toBe(2);
      expect(history[0].action).toBe('OFFER');
      expect(history[1].action).toBe(DECISION_TYPE.ACCEPT);
    });
  });
});
