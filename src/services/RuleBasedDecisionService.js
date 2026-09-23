import { DECISION_TYPE, STANCE_TYPE } from '../constants/negotiationConstants';
import { createOffer } from '../models/Offer';

/**
 * Rule-Based & Reasoning Decision Service for AI Negotiation Engine
 * Evaluates incoming offers using goals, constraints, personalities, and offer history.
 */
export const RuleBasedDecisionService = {
  /**
   * Evaluates an offer and returns a decision (ACCEPT, REJECT, COUNTEROFFER) with counterOffer & stance.
   *
   * @param {Object} params
   * @returns {Object} { decision, reason, counterOffer, stance }
   */
  evaluateOffer({
    scenario,
    agentId,
    agentGoal,
    agentConstraint,
    agentPersonality = 'Collaborative',
    currentOffer,
    previousOffer = null,
    currentRound = 1,
    maxRounds = 5,
  }) {
    const currency = scenario?.currencySymbol || '$';
    const unit = scenario?.unit || 'price';

    if (!currentOffer) {
      // If no offer to respond to, generate an initial offer
      const initialValue = this._getInitialAgentOfferValue(scenario, agentId);
      const initialOffer = createOffer({
        value: initialValue,
        terms: `Opening proposal of ${currency}${initialValue.toLocaleString()} ${unit}`,
        agentId,
        roundNumber: currentRound,
        reason: `Opening negotiation with an initial baseline offer aligned with my goal to ${agentGoal.toLowerCase()}.`,
      });

      return {
        decision: DECISION_TYPE.COUNTEROFFER,
        reason: `Hello! I would like to propose an opening ${unit.toLowerCase()} of ${currency}${initialValue.toLocaleString()}. This aligns with our baseline goal to ${agentGoal.toLowerCase()}.`,
        counterOffer: initialOffer,
        stance: STANCE_TYPE.FIRM,
      };
    }

    const agentMeta = this._getAgentMeta(scenario, agentId);
    const { target, reservation, preferredDirection } = agentMeta;
    const offerVal = currentOffer.value;

    const isWantsDecrease = preferredDirection === 'DECREASE';

    // 1. Check if current offer is better than or equal to target -> ACCEPT
    if (isWantsDecrease ? offerVal <= target : offerVal >= target) {
      return {
        decision: DECISION_TYPE.ACCEPT,
        reason: `Offer of ${currency}${offerVal.toLocaleString()} meets or exceeds target of ${currency}${target.toLocaleString()}. I am pleased to accept these terms and finalize the deal.`,
        counterOffer: null,
        stance: STANCE_TYPE.YIELDING,
      };
    }

    // 2. Check if offer is far outside acceptable reservation limit -> REJECT
    const isBeyondReservation = isWantsDecrease
      ? offerVal > reservation
      : offerVal < reservation;

    const gapPercentage = (Math.abs(offerVal - reservation) / (reservation || 1)) * 100;

    if (isBeyondReservation && (gapPercentage > 40 || currentRound > maxRounds)) {
      return {
        decision: DECISION_TYPE.REJECT,
        reason: `I cannot accept your offer of ${currency}${offerVal.toLocaleString()}. It violates constraint (${agentConstraint}) and exceeds reservation limit (${currency}${reservation.toLocaleString()}). Since we cannot bridge this gap, I must decline.`,
        counterOffer: null,
        stance: STANCE_TYPE.STUBBORN,
      };
    }

    // 3. Acceptance tolerance threshold based on personality & round progression
    let toleranceFactor = 0.05;
    if (agentPersonality === 'Aggressive') {
      toleranceFactor = currentRound >= 4 ? 0.10 : 0.04;
    } else if (agentPersonality === 'Collaborative') {
      toleranceFactor = currentRound >= 3 ? 0.22 : 0.14;
    } else if (agentPersonality === 'Risk-Averse') {
      toleranceFactor = currentRound >= 2 ? 0.25 : 0.12;
    }

    const acceptableThreshold = isWantsDecrease
      ? target + (reservation - target) * toleranceFactor
      : target - (target - reservation) * toleranceFactor;

    const isWithinTolerance = isWantsDecrease
      ? offerVal <= acceptableThreshold
      : offerVal >= acceptableThreshold;

    if (isWithinTolerance) {
      return {
        decision: DECISION_TYPE.ACCEPT,
        reason: `Considering our progress in round ${currentRound} and my ${agentPersonality.toLowerCase()} approach, I accept your offer of ${currency}${offerVal.toLocaleString()}. It falls within my workable range.`,
        counterOffer: null,
        stance: STANCE_TYPE.FLEXIBLE,
      };
    }

    // 4. Otherwise -> Generate COUNTEROFFER & Calculate Stance
    const counterValue = this._calculateCounterOfferValue({
      agentMeta,
      agentPersonality,
      currentOfferValue: offerVal,
      previousOfferValue: previousOffer ? previousOffer.value : null,
      currentRound,
    });

    // Stance Determination
    let stance = STANCE_TYPE.MODERATE;
    if (agentPersonality === 'Aggressive' && currentRound <= 2) {
      stance = STANCE_TYPE.FIRM;
    } else if (agentPersonality === 'Collaborative') {
      stance = STANCE_TYPE.FLEXIBLE;
    } else if (agentPersonality === 'Risk-Averse' && currentRound >= 3) {
      stance = STANCE_TYPE.YIELDING;
    }

    const counterReasonText = this._generateDialogueText({
      agentId,
      agentPersonality,
      agentGoal,
      currentOfferValue: offerVal,
      counterValue,
      currency,
      unit,
      currentRound,
    });

    const counterOffer = createOffer({
      value: counterValue,
      terms: `Counterproposal of ${currency}${counterValue.toLocaleString()} ${unit}`,
      agentId,
      roundNumber: currentRound,
      reason: counterReasonText,
    });

    return {
      decision: DECISION_TYPE.COUNTEROFFER,
      reason: counterReasonText,
      counterOffer,
      stance,
    };
  },

  /**
   * Internal helper to extract agent target & reservation metadata.
   */
  _getAgentMeta(scenario, agentId) {
    const defaultMeta = {
      target: scenario?.initialOfferValue ? scenario.initialOfferValue * 0.8 : 80000,
      reservation: scenario?.initialOfferValue ? scenario.initialOfferValue * 1.1 : 110000,
      preferredDirection: 'DECREASE',
    };

    if (!scenario || !scenario.agents) return defaultMeta;

    const found = scenario.agents.find(
      (a) => a.id === agentId || a.name === agentId
    );

    if (!found) return defaultMeta;

    return {
      target: found.baselineTarget ?? defaultMeta.target,
      reservation: found.baselineReservation ?? defaultMeta.reservation,
      preferredDirection: found.preferredDirection ?? 'DECREASE',
    };
  },

  /**
   * Internal helper to calculate initial offer value for an agent.
   */
  _getInitialAgentOfferValue(scenario, agentId) {
    const meta = this._getAgentMeta(scenario, agentId);
    return meta.target;
  },

  /**
   * Calculates a counteroffer value stepping towards the current offer.
   */
  _calculateCounterOfferValue({
    agentMeta,
    agentPersonality,
    currentOfferValue,
    previousOfferValue,
    currentRound,
  }) {
    const { target, reservation, preferredDirection } = agentMeta;
    const startValue = previousOfferValue ?? target;

    let stepRate = 0.05;
    if (agentPersonality === 'Aggressive') {
      stepRate = 0.04;
    } else if (agentPersonality === 'Collaborative') {
      stepRate = 0.12;
    } else if (agentPersonality === 'Risk-Averse') {
      stepRate = 0.08;
    }

    stepRate += (currentRound - 1) * 0.02;

    const gap = currentOfferValue - startValue;
    let nextValue = startValue + gap * stepRate;

    if (preferredDirection === 'DECREASE') {
      nextValue = Math.min(nextValue, reservation);
    } else {
      nextValue = Math.max(nextValue, reservation);
    }

    return Math.round(nextValue);
  },

  /**
   * Generates realistic persona-driven dialogue text.
   */
  _generateDialogueText({
    agentPersonality,
    agentGoal,
    currentOfferValue,
    counterValue,
    currency,
    unit,
    currentRound,
  }) {
    if (agentPersonality === 'Aggressive') {
      return `Your offer of ${currency}${currentOfferValue.toLocaleString()} falls well short of our expectations. Operating firmly to ${agentGoal.toLowerCase()}, my best counteroffer is ${currency}${counterValue.toLocaleString()} ${unit}.`;
    } else if (agentPersonality === 'Risk-Averse') {
      return `I want to ensure we reach a safe agreement without risking a breakdown. I cannot accept ${currency}${currentOfferValue.toLocaleString()}, but I am willing to offer ${currency}${counterValue.toLocaleString()} to move us closer.`;
    } else {
      return `Thank you for your proposal of ${currency}${currentOfferValue.toLocaleString()}. In a spirit of collaboration, I can meet you midway at ${currency}${counterValue.toLocaleString()} ${unit} in Round ${currentRound}.`;
    }
  },
};
