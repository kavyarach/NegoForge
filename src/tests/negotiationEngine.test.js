import { describe, it, expect } from 'vitest';
import { NEGOTIATION_STATUS, DECISION_TYPE, CONCESSION_DIRECTION } from '../constants/negotiationConstants';
import { scenarios } from '../constants/scenarios';
import { createOffer } from '../models/Offer';
import { createNegotiationState } from '../models/NegotiationState';
import { calculateConcession, trackAgentConcessions, validateConcession } from '../services/ConcessionTracker';
import { RuleBasedDecisionService } from '../services/RuleBasedDecisionService';
import { NegotiationOrchestrator } from '../services/NegotiationOrchestrator';
import { NegotiationApi } from '../services/NegotiationApi';
import { generate_agent_response, validateLLMResponse } from '../services/LLMIntegrationInterface';

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

  describe('7. Task Requirements (A through J Verification)', () => {
    // A. Very favorable offer -> ACCEPT
    it('A. Very favorable offer returns ACCEPT', () => {
      const veryFavorableOffer = createOffer({
        value: 75000, // Below Buyer's target of 80000
        agentId: 'Vendor',
        roundNumber: 1,
      });

      const result = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Buyer',
        agentGoal: 'Get best price',
        agentConstraint: 'Budget limit',
        agentPersonality: 'Collaborative',
        currentOffer: veryFavorableOffer,
        currentRound: 1,
      });

      expect(result.decision).toBe(DECISION_TYPE.ACCEPT);
      expect(result.counterOffer).toBeNull();
      expect(result.reason).toContain('meets or exceeds target');
    });

    // B. Partially acceptable offer -> COUNTER
    it('B. Partially acceptable offer returns COUNTER (COUNTEROFFER)', () => {
      const partialOffer = createOffer({
        value: 100000, // Above target 80000, within reservation 110000
        agentId: 'Vendor',
        roundNumber: 1,
      });

      const result = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Buyer',
        agentGoal: 'Get best price',
        agentConstraint: 'Budget limit',
        agentPersonality: 'Collaborative',
        currentOffer: partialOffer,
        currentRound: 1,
      });

      expect([DECISION_TYPE.COUNTEROFFER, 'COUNTER']).toContain(result.decision);
      expect(result.counterOffer).not.toBeNull();
      expect(result.counterOffer.value).toBeLessThan(100000);
      expect(result.counterOffer.value).toBeGreaterThanOrEqual(80000);
    });

    // C. Unacceptable offer -> REJECT
    it('C. Unacceptable offer outside reservation limit returns REJECT', () => {
      const unacceptableOffer = createOffer({
        value: 160000, // Exceeds Buyer reservation (110000) by >45%
        agentId: 'Vendor',
        roundNumber: 2,
      });

      const result = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Buyer',
        agentGoal: 'Get best price',
        agentConstraint: 'Budget boundary',
        agentPersonality: 'Aggressive',
        currentOffer: unacceptableOffer,
        currentRound: 2,
      });

      expect(result.decision).toBe(DECISION_TYPE.REJECT);
      expect(result.counterOffer).toBeNull();
      expect(result.reason).toContain('violates constraint');
    });

    // D. Counteroffer remains within constraints
    it('D. Counteroffer remains strictly within target and reservation constraints', () => {
      const opponentOffer = createOffer({
        value: 105000,
        agentId: 'Vendor',
        roundNumber: 1,
      });

      // Buyer: target 80000, reservation 110000
      const buyerResult = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Buyer',
        agentGoal: 'Get best price',
        agentConstraint: 'Budget limit',
        agentPersonality: 'Collaborative',
        currentOffer: opponentOffer,
        currentRound: 1,
      });

      expect(buyerResult.counterOffer.value).toBeGreaterThanOrEqual(80000);
      expect(buyerResult.counterOffer.value).toBeLessThanOrEqual(110000);

      // Vendor: target 120000, reservation 85000 (INCREASE)
      const buyerOffer = createOffer({
        value: 90000,
        agentId: 'Buyer',
        roundNumber: 1,
      });

      const vendorResult = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Vendor',
        agentGoal: 'Maximize profit',
        agentConstraint: 'Cost boundary',
        agentPersonality: 'Collaborative',
        currentOffer: buyerOffer,
        currentRound: 1,
      });

      expect(vendorResult.counterOffer.value).toBeGreaterThanOrEqual(85000);
      expect(vendorResult.counterOffer.value).toBeLessThanOrEqual(120000);

      // Verify validateConcession clamps proposed jumps exceeding reservation
      const clampedCheck = validateConcession({
        proposedValue: 150000,
        previousValue: 90000,
        target: 80000,
        reservation: 110000,
        preferredDirection: 'DECREASE',
      });
      expect(clampedCheck.isValid).toBe(false);
      expect(clampedCheck.clampedValue).toBeLessThanOrEqual(110000);
    });

    // E. Concession tracking across multiple rounds
    it('E. Tracks initial, previous, current positions and cumulative concessions across rounds', () => {
      const history = [];

      // Round 1
      const concession1 = trackAgentConcessions(history, 'Buyer', 80000);
      expect(concession1.initialPosition).toBe(80000);
      expect(concession1.previousPosition).toBeNull();
      expect(concession1.currentPosition).toBe(80000);
      expect(concession1.cumulativeConcession).toBe(0);

      history.push({
        round: 1,
        agent: 'Buyer',
        offer: { value: 80000 },
        concession: concession1,
      });

      // Round 2
      const concession2 = trackAgentConcessions(history, 'Buyer', 85000);
      expect(concession2.initialPosition).toBe(80000);
      expect(concession2.previousPosition).toBe(80000);
      expect(concession2.currentPosition).toBe(85000);
      expect(concession2.concessionAmount).toBe(5000);
      expect(concession2.cumulativeConcession).toBe(5000);
      expect(concession2.direction).toBe(CONCESSION_DIRECTION.INCREASE);

      history.push({
        round: 2,
        agent: 'Buyer',
        offer: { value: 85000 },
        concession: concession2,
      });

      // Round 3
      const concession3 = trackAgentConcessions(history, 'Buyer', 92000);
      expect(concession3.initialPosition).toBe(80000);
      expect(concession3.previousPosition).toBe(85000);
      expect(concession3.currentPosition).toBe(92000);
      expect(concession3.concessionAmount).toBe(7000);
      expect(concession3.cumulativeConcession).toBe(12000);
    });

    // F. Personality affects concession behavior
    it('F. Aggressive persona makes smaller concessions than Collaborative persona', () => {
      const currentOffer = createOffer({
        value: 110000,
        agentId: 'Vendor',
        roundNumber: 1,
      });

      const aggressiveResult = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Buyer',
        agentGoal: 'Best price',
        agentConstraint: 'Budget',
        agentPersonality: 'Aggressive',
        currentOffer,
        previousOffer: createOffer({ value: 80000, agentId: 'Buyer', roundNumber: 1 }),
        currentRound: 2,
      });

      const collaborativeResult = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Buyer',
        agentGoal: 'Best price',
        agentConstraint: 'Budget',
        agentPersonality: 'Collaborative',
        currentOffer,
        previousOffer: createOffer({ value: 80000, agentId: 'Buyer', roundNumber: 1 }),
        currentRound: 2,
      });

      // Aggressive counteroffer stays closer to target (80000), meaning smaller concession
      expect(aggressiveResult.counterOffer.value).toBeLessThan(collaborativeResult.counterOffer.value);
    });

    // G. DECREASE negotiation (Vendor Pricing)
    it('G. Handles DECREASE negotiation logic properly for Buyer', () => {
      const target = scenarios.vendor.agents[0].baselineTarget; // 80000
      const reservation = scenarios.vendor.agents[0].baselineReservation; // 110000

      // When vendor offers exactly target -> ACCEPT
      const res1 = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Buyer',
        agentGoal: 'Lowest price',
        agentConstraint: 'Budget',
        currentOffer: createOffer({ value: target, agentId: 'Vendor', roundNumber: 1 }),
        currentRound: 1,
      });
      expect(res1.decision).toBe(DECISION_TYPE.ACCEPT);

      // When vendor offers beyond reservation -> REJECT
      const res2 = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Buyer',
        agentGoal: 'Lowest price',
        agentConstraint: 'Budget',
        currentOffer: createOffer({ value: reservation + 50000, agentId: 'Vendor', roundNumber: 1 }),
        currentRound: 1,
      });
      expect(res2.decision).toBe(DECISION_TYPE.REJECT);
    });

    // H. INCREASE negotiation (Job Offer)
    it('H. Handles INCREASE negotiation logic properly for Job Candidate', () => {
      const candidateTarget = scenarios.job.agents[0].baselineTarget; // 150000
      const candidateReservation = scenarios.job.agents[0].baselineReservation; // 115000

      // When HR offers at or above target -> ACCEPT
      const res1 = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.job,
        agentId: 'Candidate',
        agentGoal: 'High salary',
        agentConstraint: 'Min salary',
        currentOffer: createOffer({ value: 155000, agentId: 'HR', roundNumber: 1 }),
        currentRound: 1,
      });
      expect(res1.decision).toBe(DECISION_TYPE.ACCEPT);

      // When HR offers in negotiable range -> COUNTER
      const res2 = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.job,
        agentId: 'Candidate',
        agentGoal: 'High salary',
        agentConstraint: 'Min salary',
        currentOffer: createOffer({ value: 130000, agentId: 'HR', roundNumber: 1 }),
        currentRound: 1,
      });
      expect(res2.decision).toBe(DECISION_TYPE.COUNTEROFFER);
      expect(res2.counterOffer.value).toBeGreaterThanOrEqual(candidateReservation);
      expect(res2.counterOffer.value).toBeLessThanOrEqual(candidateTarget);

      // When HR offers far below reservation -> REJECT
      const res3 = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.job,
        agentId: 'Candidate',
        agentGoal: 'High salary',
        agentConstraint: 'Min salary',
        currentOffer: createOffer({ value: 80000, agentId: 'HR', roundNumber: 1 }),
        currentRound: 1,
      });
      expect(res3.decision).toBe(DECISION_TYPE.REJECT);
    });

    // I. 3–5 round Vendor Pricing negotiation
    it('I. Simulates a complete 3-5 round Vendor Pricing negotiation with history and status', () => {
      const orchestrator = new NegotiationOrchestrator();
      let state = orchestrator.startNegotiation(scenarios.vendor, {
        Buyer: 'Collaborative',
        Vendor: 'Collaborative',
      });

      let steps = 0;
      while (state.negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS && steps < 12) {
        steps++;
        state = orchestrator.executeTurnStep();
      }

      expect(steps).toBeGreaterThanOrEqual(3);
      expect(state.negotiationHistory.length).toBe(steps);
      expect([NEGOTIATION_STATUS.AGREEMENT, NEGOTIATION_STATUS.DEADLOCK, NEGOTIATION_STATUS.REJECTED]).toContain(state.negotiationStatus);
      expect(state.negotiationHistory.every((h) => h.reason && h.action)).toBe(true);
    });

    // J. LLM failure falls back safely to deterministic logic
    it('J. LLM failure, invalid JSON, or constraint violation falls back safely to deterministic logic', () => {
      const state = createNegotiationState({
        scenario: scenarios.vendor,
        agentConfigs: { Buyer: 'Collaborative', Vendor: 'Collaborative' },
      });
      state.currentOffer = createOffer({ value: 95000, agentId: 'Vendor', roundNumber: 1 });

      const agentInput = {
        agentId: 'Buyer',
        persona: 'Collaborative',
        role: 'Customer',
        goals: 'Get best price',
        constraints: 'Budget limit',
      };

      // Case 1: Custom LLM caller throws an exception -> Safe Fallback
      const failingLlmCaller = () => {
        throw new Error('LLM Service Unavailable (500)');
      };

      const response1 = generate_agent_response(agentInput, state, [], failingLlmCaller);
      expect(response1.decision).toBe(DECISION_TYPE.COUNTEROFFER);
      expect(response1.source).toBe('DETERMINISTIC_FALLBACK');
      expect(response1.isMockResponse).toBe(true);

      // Case 2: LLM caller returns an offer that violates reservation constraint (e.g. 200,000 > reservation 110,000)
      const violatingLlmCaller = () => ({
        decision: 'COUNTER',
        offer: 200000,
        reasoning: 'Unconstrained LLM hallucination',
      });

      const response2 = generate_agent_response(agentInput, state, [], violatingLlmCaller);
      expect(response2.source).toBe('DETERMINISTIC_FALLBACK');
      expect(response2.counterOffer.value).toBeLessThanOrEqual(110000);
      expect(response2.counterOffer.value).toBeGreaterThanOrEqual(80000);

      // Case 3: validateLLMResponse helper unit test with malformed output
      const malformedValidation = validateLLMResponse({
        rawResponse: 'not an object',
        agentMeta: { target: 80000, reservation: 110000, preferredDirection: 'DECREASE' },
        agentId: 'Buyer',
        currentRound: 1,
      });
      expect(malformedValidation.isValid).toBe(false);
    });
  });
});

