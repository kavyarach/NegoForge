import { NEGOTIATION_STATUS } from '../constants/negotiationConstants.js';
import { MultiAttributeUtilityService } from './MultiAttributeUtilityService.js';

/**
 * Milestone 4 - Outcome Evaluation Service
 *
 * Generates the final negotiation outcome:
 * - Final agreement terms
 * - Rounds elapsed
 * - Concession timeline
 * - Objective satisfaction per agent
 * - Negotiation metrics
 * - Strategic takeaways
 * - Full transcript
 */
export const OutcomeEvaluationService = {
  generateReport(negotiationState) {
    if (!negotiationState) return null;

    const {
      negotiationId,
      scenario,
      mode,
      negotiationStatus,
      currentRound,
      currentOffer,
      negotiationHistory = [],
      agentGoals = {},
      agentConstraints = {},
      agentPersonality = {},
      agentStances = {},
    } = negotiationState;

    const agents = scenario?.agents || [];

    const agent1 = agents[0] || {
      id: 'Agent1',
      name: 'Agent 1',
      role: 'Participant',
    };

    const agent2 = agents[1] || {
      id: 'Agent2',
      name: 'Agent 2',
      role: 'Participant',
    };

    const agent1Id = agent1.id || agent1.name;
    const agent2Id = agent2.id || agent2.name;

    const currency = scenario?.currencySymbol || '₹';
    const unit = scenario?.unit || 'Amount';

    /* ---------------------------------------------------------
       INITIAL OFFERS
    --------------------------------------------------------- */

    const firstOffer1 = negotiationHistory.find(
      (event) =>
        event.agent === agent1Id &&
        event.offer &&
        typeof event.offer.value === 'number'
    );

    const firstOffer2 = negotiationHistory.find(
      (event) =>
        event.agent === agent2Id &&
        event.offer &&
        typeof event.offer.value === 'number'
    );

    const initialOffer1 =
      firstOffer1?.offer?.value ??
      scenario?.initialOfferValue ??
      agent1.baselineTarget ??
      0;

    const initialOffer2 =
      firstOffer2?.offer?.value ??
      agent2.baselineTarget ??
      0;

    const initialGap = Math.abs(
      initialOffer1 - initialOffer2
    );

    /* ---------------------------------------------------------
       FINAL AGREEMENT
    --------------------------------------------------------- */

    const acceptEvent = [...negotiationHistory]
      .reverse()
      .find(
        (event) =>
          event.action === 'ACCEPT' ||
          event.decision === 'ACCEPT'
      );

    const finalPrice =
      acceptEvent?.offer?.value ??
      (negotiationStatus === NEGOTIATION_STATUS.AGREEMENT
        ? currentOffer?.value
        : null);

    const finalTerms =
      acceptEvent?.offer?.terms ??
      (negotiationStatus === NEGOTIATION_STATUS.AGREEMENT
        ? currentOffer?.terms ?? null
        : null);

    const agent1Utility = finalPrice !== null && finalPrice !== undefined && acceptEvent?.offer
      ? MultiAttributeUtilityService.scoreOffer(scenario, agent1Id, acceptEvent.offer)
      : null;
    const agent2Utility = finalPrice !== null && finalPrice !== undefined && acceptEvent?.offer
      ? MultiAttributeUtilityService.scoreOffer(scenario, agent2Id, acceptEvent.offer)
      : null;

    let agreementTerm = 'No Agreement Reached';

    if (finalPrice !== null && finalPrice !== undefined) {
      agreementTerm =
        `Settled at ${currency}${Number(finalPrice).toLocaleString()}`;
    }

    /* ---------------------------------------------------------
       FINAL GAP
    --------------------------------------------------------- */

    let finalGap = initialGap;

    if (
      finalPrice !== null &&
      finalPrice !== undefined
    ) {
      finalGap = 0;
    } else if (currentOffer?.value !== undefined) {
      finalGap = Math.abs(
        currentOffer.value -
        (negotiationState.previousOffer?.value ?? initialOffer2)
      );
    }

    const gapReductionPercentage =
      initialGap > 0
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round(
                ((initialGap - finalGap) / initialGap) * 100
              )
            )
          )
        : 0;

    /* ---------------------------------------------------------
       CONCESSION TIMELINE
    --------------------------------------------------------- */

    const concessionTimeline = negotiationHistory
      .filter(
        (event) =>
          event.concession &&
          event.concession.previousValue !== null &&
          event.concession.previousValue !== undefined
      )
      .map((event) => ({
        round: event.round,
        agent: event.agent,
        previousValue: event.concession.previousValue,
        currentValue:
          event.concession.currentValue ??
          event.offer?.value ??
          0,
        concessionAmount:
          event.concession.concessionAmount || 0,
        concessionPercentage:
          event.concession.concessionPercentage || 0,
        direction:
          event.concession.direction || 'NO_CHANGE',
        timestamp: event.timestamp,
      }));

    /* ---------------------------------------------------------
       TOTAL CONCESSIONS
    --------------------------------------------------------- */

    const agent1Concessions = concessionTimeline
      .filter((item) => item.agent === agent1Id)
      .reduce(
        (sum, item) =>
          sum + Number(item.concessionAmount || 0),
        0
      );

    const agent2Concessions = concessionTimeline
      .filter((item) => item.agent === agent2Id)
      .reduce(
        (sum, item) =>
          sum + Number(item.concessionAmount || 0),
        0
      );

    const totalConcessionVolume =
      agent1Concessions + agent2Concessions;

    /* ---------------------------------------------------------
       OBJECTIVE SATISFACTION
    --------------------------------------------------------- */

    const calculateObjectiveSatisfaction = (
      agent,
      finalValue
    ) => {
      if (
        finalValue === null ||
        finalValue === undefined
      ) {
        return 0;
      }

      const target = Number(agent.baselineTarget);
      const reservation = Number(
        agent.baselineReservation
      );

      if (
        !Number.isFinite(target) ||
        !Number.isFinite(reservation)
      ) {
        return 50;
      }

      const direction =
        agent.preferredDirection;

      let score;

      if (direction === 'DECREASE') {
        if (finalValue <= target) {
          score = 100;
        } else if (finalValue >= reservation) {
          score = 0;
        } else {
          score =
            100 -
            ((finalValue - target) /
              (reservation - target)) *
              100;
        }
      } else {
        if (finalValue >= target) {
          score = 100;
        } else if (finalValue <= reservation) {
          score = 0;
        } else {
          score =
            ((finalValue - reservation) /
              (target - reservation)) *
              100;
        }
      }

      return Math.max(
        0,
        Math.min(100, Math.round(score))
      );
    };

    const agent1Satisfaction =
      calculateObjectiveSatisfaction(
        agent1,
        finalPrice
      );

    const agent2Satisfaction =
      calculateObjectiveSatisfaction(
        agent2,
        finalPrice
      );

    /* ---------------------------------------------------------
       AGENT METRICS
    --------------------------------------------------------- */

    const getStance = (personality) => {
      if (personality === 'Aggressive') {
        return 'Firm / Dominant';
      }

      if (personality === 'Collaborative') {
        return 'Flexible / Cooperative';
      }

      if (personality === 'Risk-Averse') {
        return 'Cautious / Yielding';
      }

      return agentStances[personality] || 'Moderate';
    };

    const buildAgentMetrics = (
      agent,
      agentId,
      concessions,
      satisfaction
    ) => {
      const personality =
        agentPersonality[agentId] ||
        'Collaborative';

      return {
        id: agentId,
        name: agent.name,
        role: agent.role,
        personality,
        stance: getStance(personality),
        goal:
          agentGoals[agentId] ||
          agent.goal ||
          '',
        constraint:
          agentConstraints[agentId] ||
          agent.constraint ||
          '',
        totalConcession: concessions,
        objectiveSatisfaction: satisfaction,

        // Keep the old field so existing UI/tests remain compatible.
        performanceScore: satisfaction,
      };
    };

    const agent1Metrics = buildAgentMetrics(
      agent1,
      agent1Id,
      agent1Concessions,
      agent1Satisfaction
    );

    const agent2Metrics = buildAgentMetrics(
      agent2,
      agent2Id,
      agent2Concessions,
      agent2Satisfaction
    );

    /* ---------------------------------------------------------
       NEGOTIATION SCORE
    --------------------------------------------------------- */

    let negotiationScore = 50;

    if (
      negotiationStatus ===
      NEGOTIATION_STATUS.AGREEMENT
    ) {
      negotiationScore = Math.round(
        (agent1Satisfaction +
          agent2Satisfaction) /
          2
      );
    } else if (
      negotiationStatus ===
      NEGOTIATION_STATUS.DEADLOCK
    ) {
      negotiationScore = 25;
    } else if (
      negotiationStatus ===
      NEGOTIATION_STATUS.REJECTED
    ) {
      negotiationScore = 20;
    }

    /* ---------------------------------------------------------
       STRATEGIC TAKEAWAYS
    --------------------------------------------------------- */

    const takeaways = [];

    if (
      negotiationStatus ===
      NEGOTIATION_STATUS.AGREEMENT
    ) {
      takeaways.push(
        `Agreement reached after ${currentRound} round${
          currentRound === 1 ? '' : 's'
        }.`
      );

      takeaways.push(
        `The negotiation reduced the initial gap by ${gapReductionPercentage}%.`
      );

      if (totalConcessionVolume > 0) {
        takeaways.push(
          `Combined recorded concessions were ${currency}${totalConcessionVolume.toLocaleString()}.`
        );
      }

      if (
        Math.abs(
          agent1Satisfaction -
            agent2Satisfaction
        ) <= 15
      ) {
        takeaways.push(
          'Both parties achieved relatively balanced objective satisfaction.'
        );
      }
    } else if (
      negotiationStatus ===
      NEGOTIATION_STATUS.DEADLOCK
    ) {
      takeaways.push(
        `Negotiation reached deadlock after ${currentRound} rounds.`
      );

      takeaways.push(
        'The final positions remained too far apart to reach an agreement.'
      );
    } else if (
      negotiationStatus ===
      NEGOTIATION_STATUS.REJECTED
    ) {
      takeaways.push(
        'The negotiation ended without an accepted agreement.'
      );
    } else {
      takeaways.push(
        'The negotiation is still in progress.'
      );
    }

    /* ---------------------------------------------------------
       FINAL REPORT
    --------------------------------------------------------- */

    return {
      negotiationId,
      scenarioId: scenario?.id,
      scenarioTitle:
        scenario?.title ||
        'Negotiation Scenario',

      mode,

      status: negotiationStatus,
      roundsTaken: currentRound,

      agreementTerm,
      finalPrice,
      finalTerms,
      agent1Utility,
      agent2Utility,

      currency,
      unit,

      initialOffer1,
      initialOffer2,
      initialGap,
      finalGap,
      gapReductionPercentage,

      totalConcessionVolume,
      concessionTimeline,

      negotiationScore,

      agent1Metrics,
      agent2Metrics,

      takeaways,

      // Required for downloadable transcript.
      transcript: negotiationHistory,

      generatedAt:
        new Date().toISOString(),

      timestamp:
        new Date().toISOString(),
    };
  },
};