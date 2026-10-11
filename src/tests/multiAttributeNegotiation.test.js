import { describe, expect, it } from 'vitest';
import { scenarios } from '../constants/scenarios';
import { createOffer } from '../models/Offer';
import { MultiAttributeUtilityService } from '../services/MultiAttributeUtilityService';
import { RuleBasedDecisionService } from '../services/RuleBasedDecisionService';
import { NegotiationOrchestrator } from '../services/NegotiationOrchestrator';
import { DECISION_TYPE } from '../constants/negotiationConstants';

describe('Phase 4 - Genuine Multi-Attribute Negotiation', () => {
  it('scores an agent-preferred package higher than the default package', () => {
    const preferred = createOffer({
      value: 80000,
      terms: { deliveryDays: 7, paymentDeadlineDays: 60, warrantyMonths: 18, orderQuantity: 75 },
      agentId: 'Buyer',
      roundNumber: 1,
    });
    const defaultPackage = createOffer({
      value: 80000,
      terms: { deliveryDays: 14, paymentDeadlineDays: 30, warrantyMonths: 12, orderQuantity: 50 },
      agentId: 'Vendor',
      roundNumber: 1,
    });

    const preferredScore = MultiAttributeUtilityService.scoreOffer(scenarios.vendor, 'Buyer', preferred);
    const defaultScore = MultiAttributeUtilityService.scoreOffer(scenarios.vendor, 'Buyer', defaultPackage);

    expect(preferredScore.utility).toBeGreaterThan(defaultScore.utility);
    expect(preferredScore.utility).toBe(1);
    expect(preferredScore.breakdown.length).toBeGreaterThan(1);
  });

  it('generates a counteroffer that changes multiple terms, not only price', () => {
    const incoming = createOffer({
      value: 105000,
      terms: { deliveryDays: 14, paymentDeadlineDays: 30, warrantyMonths: 12, orderQuantity: 50 },
      agentId: 'Vendor',
      roundNumber: 1,
    });

    const result = RuleBasedDecisionService.evaluateOffer({
      scenario: scenarios.vendor,
      agentId: 'Buyer',
      agentGoal: 'Get the best possible price',
      agentConstraint: 'Limited budget',
      currentOffer: incoming,
      currentRound: 1,
    });

    expect(result.decision).toBe(DECISION_TYPE.COUNTEROFFER);
    expect(result.counterOffer.terms.deliveryDays).toBeLessThan(incoming.terms.deliveryDays);
    expect(result.counterOffer.terms.paymentDeadlineDays).toBeGreaterThan(incoming.terms.paymentDeadlineDays);
    expect(result.counterOffer.terms.warrantyMonths).toBeGreaterThan(incoming.terms.warrantyMonths);
    expect(result.tradeoffs.length).toBeGreaterThan(1);
  });

  it('keeps job work mode as a real categorical negotiation term', () => {
    const candidateOffer = createOffer({
      value: 145000,
      terms: { joiningBonus: 15000, workMode: 'Remote', leaveDays: 28, noticePeriodDays: 20 },
      agentId: 'Candidate',
      roundNumber: 1,
    });
    const score = MultiAttributeUtilityService.scoreOffer(scenarios.job, 'Candidate', candidateOffer);
    expect(score.utility).toBeGreaterThan(0.9);
    expect(score.breakdown.find((item) => item.term === 'workMode').score).toBe(1);
  });

  it('runs AI-vs-AI turns with structured multi-attribute packages', () => {
    const orchestrator = new NegotiationOrchestrator();
    let state = orchestrator.startNegotiation(scenarios.vendor, {
      Buyer: 'Collaborative',
      Vendor: 'Analytical',
    });

    state = orchestrator.executeTurnStep();
    expect(typeof state.currentOffer.terms).toBe('object');
    expect(state.currentOffer.terms).toHaveProperty('deliveryDays');
    expect(state.currentOffer.terms).toHaveProperty('paymentDeadlineDays');
    expect(state.currentOffer.terms).toHaveProperty('warrantyMonths');
    expect(state.currentOffer.terms).toHaveProperty('orderQuantity');

    state = orchestrator.executeTurnStep();
    expect(state.currentOffer.terms.orderQuantity).toBeGreaterThanOrEqual(50);
    expect(state.negotiationHistory[1]).toHaveProperty('utility');
  });
});
