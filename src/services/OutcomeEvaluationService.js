import { NEGOTIATION_STATUS } from '../constants/negotiationConstants';

/**
 * Outcome Evaluation and Report Generation Module
 * Analyzes completed or active negotiations and generates structured performance reports.
 */
export const OutcomeEvaluationService = {
  /**
   * Generates a comprehensive outcome analysis report.
   *
   * @param {Object} negotiationState - Current negotiation state
   * @returns {Object} Structured Report
   */
  generateReport(negotiationState) {
    if (!negotiationState) return null;

    const {
      scenario,
      negotiationStatus,
      currentRound,
      negotiationHistory = [],
      agentGoals = {},
      agentConstraints = {},
      agentPersonality = {},
    } = negotiationState;

    const agents = scenario?.agents || [];
    const agent1 = agents[0] || { name: 'Agent 1', id: 'Agent1' };
    const agent2 = agents[1] || { name: 'Agent 2', id: 'Agent2' };

    const agent1Id = agent1.id || agent1.name;
    const agent2Id = agent2.id || agent2.name;

    const currency = scenario?.currencySymbol || '$';
    const unit = scenario?.unit || 'Amount';

    // Calculate initial gap and final agreement
    const initialOffer1 = negotiationHistory.find((h) => h.agent === agent1Id && h.offer)?.offer?.value || scenario?.initialOfferValue || 100000;
    const initialOffer2 = negotiationHistory.find((h) => h.agent === agent2Id && h.offer)?.offer?.value || agent2.baselineTarget || 80000;

    const initialGap = Math.abs(initialOffer1 - initialOffer2);

    let finalPrice = null;
    let agreementTerm = 'No Agreement Reached';

    if (negotiationStatus === NEGOTIATION_STATUS.AGREEMENT) {
      const acceptEvent = negotiationHistory.find((h) => h.action === 'ACCEPT');
      finalPrice = acceptEvent?.offer?.value || negotiationState.currentOffer?.value;
      agreementTerm = `Settled at ${currency}${finalPrice?.toLocaleString()}`;
    }

    // Compute Concessions per Agent
    const agent1Concessions = negotiationHistory
      .filter((h) => h.agent === agent1Id && h.concession)
      .reduce((sum, h) => sum + (h.concession.concessionAmount || 0), 0);

    const agent2Concessions = negotiationHistory
      .filter((h) => h.agent === agent2Id && h.concession)
      .reduce((sum, h) => sum + (h.concession.concessionAmount || 0), 0);

    const totalConcessionVolume = agent1Concessions + agent2Concessions;

    // Convergence & Gap Reduction Rate
    let finalGap = initialGap;
    let gapReductionPercentage = 0;

    if (finalPrice !== null) {
      finalGap = 0;
      gapReductionPercentage = 100;
    } else if (negotiationState.currentOffer && negotiationState.previousOffer) {
      finalGap = Math.abs(negotiationState.currentOffer.value - negotiationState.previousOffer.value);
      gapReductionPercentage = initialGap > 0 ? Math.max(0, Math.min(100, Math.round(((initialGap - finalGap) / initialGap) * 100))) : 0;
    }

    // Win-Win Score Calculation
    let winWinScore = 50;
    if (negotiationStatus === NEGOTIATION_STATUS.AGREEMENT) {
      const midPoint = (initialOffer1 + initialOffer2) / 2;
      const deviationFromMid = Math.abs(finalPrice - midPoint);
      const balanceRatio = initialGap > 0 ? 1 - deviationFromMid / initialGap : 1;
      winWinScore = Math.min(100, Math.max(60, Math.round(70 + balanceRatio * 30)));
    } else if (negotiationStatus === NEGOTIATION_STATUS.DEADLOCK) {
      winWinScore = 25;
    } else if (negotiationStatus === NEGOTIATION_STATUS.REJECTED) {
      winWinScore = 35;
    }

    // Per-Agent Performance Rating
    const computeAgentMetrics = (id, concessions) => {
      const personality = agentPersonality[id] || 'Collaborative';
      const goal = agentGoals[id] || '';
      const constraint = agentConstraints[id] || '';

      let stance = 'Moderate';
      if (personality === 'Aggressive') stance = 'Firm / Dominant';
      else if (personality === 'Collaborative') stance = 'Flexible / Cooperative';
      else if (personality === 'Risk-Averse') stance = 'Cautious / Yielding';

      let score = 75;
      if (negotiationStatus === NEGOTIATION_STATUS.AGREEMENT) {
        score = 88;
      } else if (concessions > totalConcessionVolume * 0.6) {
        score = 70; // Made majority of concessions
      }

      return {
        id,
        personality,
        goal,
        constraint,
        stance,
        totalConcession: concessions,
        performanceScore: score,
      };
    };

    const agent1Metrics = computeAgentMetrics(agent1Id, agent1Concessions);
    const agent2Metrics = computeAgentMetrics(agent2Id, agent2Concessions);

    // Key Takeaways / Strategic Lessons
    const takeaways = [];
    if (negotiationStatus === NEGOTIATION_STATUS.AGREEMENT) {
      takeaways.push(`Successful agreement reached in Round ${currentRound} with ${gapReductionPercentage}% gap resolution.`);
      if (Math.abs(agent1Concessions - agent2Concessions) < totalConcessionVolume * 0.2) {
        takeaways.push('Both parties demonstrated balanced concessions, resulting in a sustainable win-win outcome.');
      } else {
        const higherConceder = agent1Concessions > agent2Concessions ? agent1Id : agent2Id;
        takeaways.push(`${higherConceder} made greater concessions to break price resistance and finalize the deal.`);
      }
    } else if (negotiationStatus === NEGOTIATION_STATUS.DEADLOCK) {
      takeaways.push(`Negotiation stalled due to rigid reservation price limits in Round ${currentRound}.`);
      takeaways.push('Consider introducing non-monetary value terms or mediator compromises to bridge the deadlock.');
    } else {
      takeaways.push('Negotiation concluded without mutual consensus.');
    }

    return {
      negotiationId: negotiationState.negotiationId,
      scenarioTitle: scenario?.title || 'Negotiation Scenario',
      status: negotiationStatus,
      roundsTaken: currentRound,
      agreementTerm,
      finalPrice,
      currency,
      unit,
      initialGap,
      finalGap,
      gapReductionPercentage,
      totalConcessionVolume,
      winWinScore,
      agent1Metrics,
      agent2Metrics,
      takeaways,
      timestamp: new Date().toISOString(),
    };
  },
};
