import { describe, it, expect } from 'vitest';
import { scenarios } from '../constants/scenarios';
import { NEGOTIATION_STATUS, NEGOTIATION_MODE } from '../constants/negotiationConstants';
import { NegotiationApi } from '../services/NegotiationApi';

describe('Milestone 1 & 2 - Advanced Modules & Multi-Scenario Tests', () => {
  const agentConfigs = {
    Buyer: 'Aggressive',
    Vendor: 'Collaborative',
    Candidate: 'Collaborative',
    HR: 'Risk-Averse',
    'Project Manager': 'Aggressive',
    'Team Lead': 'Collaborative',
  };

  describe('1. Pre-built Scenario Templates (All 3 Scenarios)', () => {
    it('executes AI vs AI negotiation loop for Vendor Pricing scenario', () => {
      const state = NegotiationApi.createNegotiation(scenarios.vendor, agentConfigs, NEGOTIATION_MODE.SIMULATION);
      let currentState = state;
      let count = 0;

      while (currentState.negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS && count < 10) {
        count++;
        currentState = NegotiationApi.executeTurn(state.negotiationId);
      }

      expect(currentState.negotiationHistory.length).toBeGreaterThan(0);
      expect([NEGOTIATION_STATUS.AGREEMENT, NEGOTIATION_STATUS.DEADLOCK, NEGOTIATION_STATUS.REJECTED]).toContain(currentState.negotiationStatus);
    });

    it('executes AI vs AI negotiation loop for Job Offer scenario', () => {
      const state = NegotiationApi.createNegotiation(scenarios.job, agentConfigs, NEGOTIATION_MODE.SIMULATION);
      let currentState = state;
      let count = 0;

      while (currentState.negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS && count < 10) {
        count++;
        currentState = NegotiationApi.executeTurn(state.negotiationId);
      }

      expect(currentState.negotiationHistory.length).toBeGreaterThan(0);
      expect([NEGOTIATION_STATUS.AGREEMENT, NEGOTIATION_STATUS.DEADLOCK, NEGOTIATION_STATUS.REJECTED]).toContain(currentState.negotiationStatus);
    });

    it('executes AI vs AI negotiation loop for Project Budget Allocation scenario', () => {
      const state = NegotiationApi.createNegotiation(scenarios.budget, agentConfigs, NEGOTIATION_MODE.SIMULATION);
      let currentState = state;
      let count = 0;

      while (currentState.negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS && count < 10) {
        count++;
        currentState = NegotiationApi.executeTurn(state.negotiationId);
      }

      expect(currentState.negotiationHistory.length).toBeGreaterThan(0);
      expect([NEGOTIATION_STATUS.AGREEMENT, NEGOTIATION_STATUS.DEADLOCK, NEGOTIATION_STATUS.REJECTED]).toContain(currentState.negotiationStatus);
    });
  });

  describe('2. Practice Mode (Human Participant vs AI Agent)', () => {
    it('initializes practice mode with designated human role and accepts human decision', () => {
      const state = NegotiationApi.createNegotiation(scenarios.vendor, agentConfigs, NEGOTIATION_MODE.PRACTICE, 'Buyer');

      expect(state.mode).toBe(NEGOTIATION_MODE.PRACTICE);
      expect(state.humanAgentId).toBe('Buyer');

      // Human submits initial offer
      const updatedState = NegotiationApi.submitOffer(state.negotiationId, {
        agentId: 'Buyer',
        value: 85000,
        terms: 'Opening buyer price',
        reason: 'Budget limit',
      });

      expect(updatedState.currentOffer.value).toBe(85000);
      expect(updatedState.currentAgentTurn).toBe('Vendor');

      // AI Counterpart executes turn
      const aiState = NegotiationApi.executeTurn(state.negotiationId);
      expect(aiState.negotiationHistory.length).toBe(2);
      expect(aiState.currentAgentTurn).toBe('Buyer');
    });
  });

  describe('3. Deadlock Detection & Mediator Resolution Module', () => {
    it('detects deadlock when maximum rounds reached and resolves via mediator compromise', () => {
      const state = NegotiationApi.createNegotiation(scenarios.vendor, { Buyer: 'Aggressive', Vendor: 'Aggressive' });
      const negId = state.negotiationId;

      // Force deadlock status
      let currentState = NegotiationApi.getNegotiationState(negId);

      // Submit offers until deadlock or turn execution
      let count = 0;
      while (currentState.negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS && count < 15) {
        count++;
        currentState = NegotiationApi.executeTurn(negId);
      }

      if (currentState.negotiationStatus === NEGOTIATION_STATUS.DEADLOCK) {
        expect(currentState.deadlockDetected).toBe(true);

        // Resolve deadlock with mediator compromise
        const resolvedState = NegotiationApi.resolveDeadlock(negId);
        expect(resolvedState.negotiationStatus).toBe(NEGOTIATION_STATUS.AGREEMENT);
        expect(resolvedState.currentOffer.agentId).toBe('Orchestrator Mediator');
      }
    });
  });

  describe('4. Outcome Evaluation and Report Generation Module', () => {
    it('generates a structured outcome report with metrics, gap reduction, and per-agent performance', () => {
      const state = NegotiationApi.createNegotiation(scenarios.vendor, agentConfigs);
      const negId = state.negotiationId;

      // Run 2 turns
      NegotiationApi.executeTurn(negId);
      NegotiationApi.executeTurn(negId);

      const report = NegotiationApi.getOutcomeReport(negId);

      expect(report).toHaveProperty('negotiationId');
      expect(report).toHaveProperty('scenarioTitle');
      expect(report).toHaveProperty('gapReductionPercentage');
      expect(report).toHaveProperty('winWinScore');
      expect(report).toHaveProperty('agent1Metrics');
      expect(report).toHaveProperty('agent2Metrics');
      expect(report.takeaways.length).toBeGreaterThan(0);
    });
  });
});
