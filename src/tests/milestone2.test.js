import { describe, it, expect } from 'vitest';

import { scenarios } from '../constants/scenarios';

import {
  DECISION_TYPE,
  NEGOTIATION_STATUS,
  NEGOTIATION_MODE,
} from '../constants/negotiationConstants';

import { RuleBasedDecisionService } from '../services/RuleBasedDecisionService';

import {
  calculateConcession,
  trackAgentConcessions,
  validateConcession,
} from '../services/ConcessionTracker';

import {
  generate_agent_response,
  validateLLMResponse,
} from '../services/LLMIntegrationInterface';

import { NegotiationApi } from '../services/NegotiationApi';


describe('Milestone 2 - Decision Making & Negotiation Logic', () => {

  const agentConfigs = {
    Buyer: 'Aggressive',
    Vendor: 'Collaborative',
    Candidate: 'Collaborative',
    HR: 'Risk-Averse',
    'Project Manager': 'Aggressive',
    'Team Lead': 'Collaborative',
  };


  // ============================================================
  // 1. OFFER EVALUATION AND DECISION LOGIC
  // ============================================================

  describe('1. Offer Evaluation and Decision Logic', () => {

    it('accepts a very favorable offer', () => {

      const result = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Buyer',
        agentGoal: 'Get the best possible price',
        agentConstraint: 'Limited budget',
        agentPersonality: 'Aggressive',
        currentOffer: {
          value: 75000,
          agentId: 'Vendor',
        },
        currentRound: 1,
        maxRounds: 5,
      });

      expect(result.decision).toBe(DECISION_TYPE.ACCEPT);

      expect(result.counterOffer).toBeNull();

      expect(result.reason).toContain(
        'meets or exceeds target'
      );
    });


    it('generates a counteroffer for a partially acceptable offer', () => {

      const result = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Buyer',
        agentGoal: 'Get the best possible price',
        agentConstraint: 'Limited budget',
        agentPersonality: 'Collaborative',
        currentOffer: {
          value: 100000,
          agentId: 'Vendor',
        },
        currentRound: 2,
        maxRounds: 5,
      });

      expect([
        DECISION_TYPE.COUNTEROFFER,
        DECISION_TYPE.COUNTER,
      ]).toContain(result.decision);

      expect(result.counterOffer).not.toBeNull();

      expect(result.counterOffer.value)
        .toBeGreaterThanOrEqual(80000);

      expect(result.counterOffer.value)
        .toBeLessThan(100000);
    });


    it('rejects an unacceptable offer', () => {

      const result = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Buyer',
        agentGoal: 'Get the best possible price',
        agentConstraint: 'Limited budget',
        agentPersonality: 'Aggressive',
        currentOffer: {
          value: 160000,
          agentId: 'Vendor',
        },
        currentRound: 2,
        maxRounds: 5,
      });

      expect(result.decision).toBe(
        DECISION_TYPE.REJECT
      );

      expect(result.counterOffer).toBeNull();

      expect(result.reason).toContain(
        'violates constraint'
      );
    });

  });


  // ============================================================
  // 2. COUNTEROFFER GENERATION
  // ============================================================

  describe('2. Counteroffer Generation', () => {

    it('keeps Buyer counteroffer within target and reservation limits', () => {

      const result = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Buyer',
        agentGoal: 'Get the best possible price',
        agentConstraint: 'Limited budget',
        agentPersonality: 'Collaborative',
        currentOffer: {
          value: 105000,
          agentId: 'Vendor',
        },
        currentRound: 2,
        maxRounds: 5,
      });

      expect(result.decision).toBe(
        DECISION_TYPE.COUNTEROFFER
      );

      expect(result.counterOffer.value)
        .toBeGreaterThanOrEqual(80000);

      expect(result.counterOffer.value)
        .toBeLessThanOrEqual(110000);
    });


    it('keeps Vendor counteroffer within reservation and target limits', () => {

      const result = RuleBasedDecisionService.evaluateOffer({
        scenario: scenarios.vendor,
        agentId: 'Vendor',
        agentGoal: 'Maximize profit',
        agentConstraint: 'Minimum acceptable price',
        agentPersonality: 'Collaborative',
        currentOffer: {
          value: 90000,
          agentId: 'Buyer',
        },
        currentRound: 2,
        maxRounds: 5,
      });

      expect(result.decision).toBe(
        DECISION_TYPE.COUNTEROFFER
      );

      expect(result.counterOffer.value)
        .toBeGreaterThanOrEqual(85000);

      expect(result.counterOffer.value)
        .toBeLessThanOrEqual(120000);
    });


    it('produces different counteroffers for different personalities', () => {

      const aggressive =
        RuleBasedDecisionService.evaluateOffer({
          scenario: scenarios.vendor,
          agentId: 'Buyer',
          agentGoal: 'Get the best possible price',
          agentConstraint: 'Limited budget',
          agentPersonality: 'Aggressive',
          currentOffer: {
            value: 110000,
            agentId: 'Vendor',
          },
          previousOffer: {
            value: 80000,
          },
          currentRound: 2,
          maxRounds: 5,
        });


      const collaborative =
        RuleBasedDecisionService.evaluateOffer({
          scenario: scenarios.vendor,
          agentId: 'Buyer',
          agentGoal: 'Get the best possible price',
          agentConstraint: 'Limited budget',
          agentPersonality: 'Collaborative',
          currentOffer: {
            value: 110000,
            agentId: 'Vendor',
          },
          previousOffer: {
            value: 80000,
          },
          currentRound: 2,
          maxRounds: 5,
        });


      expect(aggressive.counterOffer)
        .not.toBeNull();

      expect(collaborative.counterOffer)
        .not.toBeNull();

      expect(aggressive.counterOffer.value)
        .not.toBe(
          collaborative.counterOffer.value
        );
    });

  });


  // ============================================================
  // 3. CONCESSION TRACKING
  // ============================================================

  describe('3. Concession Tracking', () => {

    it('tracks movement from the initial position', () => {

      const first = calculateConcession(
        null,
        80000,
        {
          initialPosition: 80000,
        }
      );

      expect(first.initialPosition)
        .toBe(80000);

      expect(first.concessionAmount)
        .toBe(0);

      expect(first.cumulativeConcession)
        .toBe(0);


      const second = calculateConcession(
        80000,
        85000,
        {
          initialPosition: 80000,
          cumulativeConcession: 0,
        }
      );

      expect(second.concessionAmount)
        .toBe(5000);

      expect(second.concessionPercentage)
        .toBe(6.25);

      expect(second.direction)
        .toBe('INCREASE');

      expect(second.cumulativeConcession)
        .toBe(5000);


      const third = calculateConcession(
        85000,
        92000,
        {
          initialPosition: 80000,
          cumulativeConcession: 5000,
        }
      );

      expect(third.concessionAmount)
        .toBe(7000);

      expect(third.cumulativeConcession)
        .toBe(12000);
    });


    it('tracks concessions for a specific agent', () => {

      const history = [
        {
          agent: 'Buyer',
          offer: {
            value: 80000,
          },
          concession: null,
        },

        {
          agent: 'Vendor',
          offer: {
            value: 120000,
          },
          concession: null,
        },

        {
          agent: 'Buyer',
          offer: {
            value: 85000,
          },
          concession: {
            concessionAmount: 5000,
          },
        },
      ];


      const result = trackAgentConcessions(
        history,
        'Buyer',
        92000
      );


      expect(result.agentId)
        .toBe('Buyer');

      expect(result.initialPosition)
        .toBe(80000);

      expect(result.previousPosition)
        .toBe(85000);

      expect(result.currentPosition)
        .toBe(92000);

      expect(result.concessionAmount)
        .toBe(7000);

      expect(result.cumulativeConcession)
        .toBe(12000);
    });


    it('prevents an unrealistic concession jump', () => {

      const result = validateConcession({
        proposedValue: 150000,
        previousValue: 90000,
        target: 80000,
        reservation: 110000,
        preferredDirection: 'DECREASE',
        maxJumpFraction: 0.35,
      });


      expect(result.isValid)
        .toBe(false);

      expect(result.clampedValue)
        .toBeLessThanOrEqual(110000);
    });

  });


  // ============================================================
  // 4. LLM INTEGRATION AND SAFE FALLBACK
  // ============================================================

  describe('4. LLM Integration and Safe Fallback', () => {

    it('falls back to deterministic reasoning when LLM fails', () => {

      const state =
        NegotiationApi.createNegotiation(
          scenarios.vendor,
          agentConfigs
        );


      state.currentOffer = {
        value: 95000,
        agentId: 'Vendor',
        roundNumber: 1,
      };

      state.currentAgentTurn = 'Buyer';


      const agentInput = {
        agentId: 'Buyer',
        persona: 'Collaborative',
        role: 'Customer',
        goals: 'Get the best possible price',
        constraints: 'Limited budget',
      };


      const result = generate_agent_response(
        agentInput,
        state,
        state.negotiationHistory,
        () => {
          throw new Error(
            'LLM service unavailable'
          );
        }
      );


      expect(result.decision)
        .toBe(DECISION_TYPE.COUNTEROFFER);

      expect(result.source)
        .toBe('DETERMINISTIC_FALLBACK');

      expect(result.isMockResponse)
        .toBe(true);
    });


    it('rejects an LLM counteroffer that violates reservation limits', () => {

      const result = validateLLMResponse({
        rawResponse: {
          decision: 'COUNTER',
          offer: 200000,
          reasoning:
            'Trying to increase the price significantly.',
        },

        agentMeta: {
          target: 80000,
          reservation: 110000,
          preferredDirection: 'DECREASE',
        },

        agentId: 'Buyer',

        currentRound: 2,

        currency: '₹',

        unit: 'Price',

        previousOfferValue: 90000,
      });


      expect(result.isValid)
        .toBe(false);
    });


    it('rejects malformed LLM output', () => {

      const result = validateLLMResponse({

        rawResponse: 'invalid response',

        agentMeta: {
          target: 80000,
          reservation: 110000,
          preferredDirection: 'DECREASE',
        },

        agentId: 'Buyer',

        currentRound: 1,
      });


      expect(result.isValid)
        .toBe(false);
    });

  });


  // ============================================================
  // 5. MULTI-ROUND ORCHESTRATOR INTEGRATION
  // ============================================================

  describe('5. Multi-Round Orchestrator Integration', () => {

    it('runs a multi-round Vendor Pricing negotiation', () => {

      const state =
        NegotiationApi.createNegotiation(
          scenarios.vendor,
          agentConfigs,
          NEGOTIATION_MODE.SIMULATION
        );


      let currentState = state;

      let steps = 0;


      while (
        currentState.negotiationStatus ===
          NEGOTIATION_STATUS.IN_PROGRESS &&
        steps < 12
      ) {

        steps++;

        currentState =
          NegotiationApi.executeTurn(
            state.negotiationId
          );
      }


      expect(steps)
        .toBeGreaterThanOrEqual(3);


      expect(
        currentState.negotiationHistory.length
      ).toBe(steps);


      expect([
        NEGOTIATION_STATUS.AGREEMENT,
        NEGOTIATION_STATUS.DEADLOCK,
        NEGOTIATION_STATUS.REJECTED,
      ]).toContain(
        currentState.negotiationStatus
      );


      expect(
        Object.keys(
          currentState.agentOffers
        ).length
      ).toBeGreaterThan(0);


      expect(
        currentState.decisions.length
      ).toBeGreaterThan(0);


      currentState.negotiationHistory.forEach(
        (entry) => {

          expect(entry.reason)
            .toBeTruthy();

          expect(entry.action)
            .toBeTruthy();

        }
      );
    });

  });


  // ============================================================
  // 6. MULTI-SCENARIO DECISION MAKING
  // ============================================================

  describe('6. Multi-Scenario Decision Making', () => {

    it('runs Vendor Pricing negotiation', () => {

      const state =
        NegotiationApi.createNegotiation(
          scenarios.vendor,
          agentConfigs
        );


      let currentState = state;

      let count = 0;


      while (
        currentState.negotiationStatus ===
          NEGOTIATION_STATUS.IN_PROGRESS &&
        count < 10
      ) {

        count++;

        currentState =
          NegotiationApi.executeTurn(
            state.negotiationId
          );
      }


      expect(
        currentState.negotiationHistory.length
      ).toBeGreaterThan(0);
    });


    it('runs Job Offer negotiation', () => {

      const state =
        NegotiationApi.createNegotiation(
          scenarios.job,
          agentConfigs
        );


      let currentState = state;

      let count = 0;


      while (
        currentState.negotiationStatus ===
          NEGOTIATION_STATUS.IN_PROGRESS &&
        count < 10
      ) {

        count++;

        currentState =
          NegotiationApi.executeTurn(
            state.negotiationId
          );
      }


      expect(
        currentState.negotiationHistory.length
      ).toBeGreaterThan(0);
    });


    it('runs Project Budget negotiation', () => {

      const state =
        NegotiationApi.createNegotiation(
          scenarios.budget,
          agentConfigs
        );


      let currentState = state;

      let count = 0;


      while (
        currentState.negotiationStatus ===
          NEGOTIATION_STATUS.IN_PROGRESS &&
        count < 10
      ) {

        count++;

        currentState =
          NegotiationApi.executeTurn(
            state.negotiationId
          );
      }


      expect(
        currentState.negotiationHistory.length
      ).toBeGreaterThan(0);
    });

  });

});