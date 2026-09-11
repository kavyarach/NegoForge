import { DECISION_TYPE, STANCE_TYPE } from '../constants/negotiationConstants';
import { createOffer } from '../models/Offer';
import { validateConcession } from './ConcessionTracker';

/**
 * Rule-Based & Reasoning Decision Service for AI Negotiation Engine
 * Evaluates incoming offers using goals, constraints, personalities, rounds, and offer history.
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
    negotiationState = null,
    previousOffers = [],
    previousCounteroffers = [],
    concessionHistory = [],
  }) {
    const currency = scenario?.currencySymbol || '$';
    const unit = scenario?.unit || 'price';

    // If no offer to respond to, generate an initial opening offer
    if (!currentOffer) {
      const initialValue = this._getInitialAgentOfferValue(scenario, agentId);
      const initialOffer = createOffer({
        value: initialValue,
        terms: `Opening proposal of ${currency}${initialValue.toLocaleString()} ${unit}`,
        agentId,
        roundNumber: currentRound,
        reason: `Opening negotiation with an initial baseline offer aligned with my goal to ${agentGoal?.toLowerCase() || 'achieve target'}.`,
      });

      return {
        decision: DECISION_TYPE.COUNTEROFFER,
        reason: `Hello! I would like to propose an opening ${unit.toLowerCase()} of ${currency}${initialValue.toLocaleString()}. This aligns with our baseline goal to ${agentGoal?.toLowerCase() || 'reach agreement'}.`,
        counterOffer: initialOffer,
        stance: STANCE_TYPE.FIRM,
      };
    }

    const agentMeta = this._getAgentMeta(scenario, agentId);
    const { target, reservation, preferredDirection } = agentMeta;
    const offerVal = currentOffer.value;
    const isWantsDecrease = preferredDirection === 'DECREASE';

    // ----------------------------------------------------
    // 1. ACCEPT EVALUATION (Target Met or Exceeded)
    // ----------------------------------------------------
    const meetsTarget = isWantsDecrease ? offerVal <= target : offerVal >= target;
    if (meetsTarget) {
      return {
        decision: DECISION_TYPE.ACCEPT,
        reason: `Offer of ${currency}${offerVal.toLocaleString()} meets or exceeds target of ${currency}${target.toLocaleString()}. I am pleased to accept these terms and finalize the deal.`,
        counterOffer: null,
        stance: STANCE_TYPE.YIELDING,
      };
    }

    // ----------------------------------------------------
    // 2. REJECT EVALUATION (Violates Constraint/Reservation)
    // ----------------------------------------------------
    const isBeyondReservation = isWantsDecrease
      ? offerVal > reservation
      : offerVal < reservation;

    const gapPercentage = (Math.abs(offerVal - reservation) / (reservation || 1)) * 100;

    // Hard rejection when severely outside reservation limit or final round exceeded without agreement
    if (isBeyondReservation && (gapPercentage > 25 || currentRound >= maxRounds)) {
      return {
        decision: DECISION_TYPE.REJECT,
        reason: `I cannot accept your offer of ${currency}${offerVal.toLocaleString()}. It violates constraint (${agentConstraint || 'budget boundary'}) and exceeds reservation limit (${currency}${reservation.toLocaleString()}). Since we cannot bridge this gap, I must decline.`,
        counterOffer: null,
        stance: STANCE_TYPE.STUBBORN,
      };
    }

    // ----------------------------------------------------
    // 3. ACCEPT EVALUATION (Tolerance Threshold)
    // ----------------------------------------------------
    // Tolerance factor expands gradually as rounds advance, bounded by personality
    let toleranceFactor = 0.05;
    if (agentPersonality === 'Aggressive') {
      toleranceFactor = currentRound >= 4 ? 0.10 : 0.04;
    } else if (agentPersonality === 'Collaborative') {
      toleranceFactor = currentRound >= 3 ? 0.22 : 0.14;
    } else if (agentPersonality === 'Risk-Averse') {
      toleranceFactor = currentRound >= 2 ? 0.25 : 0.12;
    }

    // Progressively scale tolerance with round progression without overshooting reservation
    const roundScaling = maxRounds > 1 ? ((currentRound - 1) / (maxRounds - 1)) * 0.08 : 0;
    toleranceFactor += roundScaling;

    const acceptableThreshold = isWantsDecrease
      ? Math.min(target + Math.abs(reservation - target) * toleranceFactor, reservation)
      : Math.max(target - Math.abs(target - reservation) * toleranceFactor, reservation);

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

    // ----------------------------------------------------
    // 4. COUNTEROFFER EVALUATION & GENERATION
    // ----------------------------------------------------
    const effectiveHistory = concessionHistory.length
      ? concessionHistory
      : (negotiationState?.negotiationHistory || []);

    const effectiveOffers = previousOffers.length
      ? previousOffers
      : (previousCounteroffers.length ? previousCounteroffers : (negotiationState?.counterOffers || []));

    // Identify agent's own previous offer value for continuity
    const effectivePreviousOfferValue = previousOffer
      ? previousOffer.value
      : (effectiveOffers.length > 0 ? effectiveOffers[effectiveOffers.length - 1].value : null);

    const counterValue = this._calculateCounterOfferValue({
      agentMeta,
      agentPersonality,
      currentOfferValue: offerVal,
      previousOfferValue: effectivePreviousOfferValue,
      currentRound,
      maxRounds,
      concessionHistory: effectiveHistory,
    });

    // Determine Stance based on personality and round progression
    let stance = STANCE_TYPE.MODERATE;
    if (agentPersonality === 'Aggressive') {
      stance = currentRound <= 3 ? STANCE_TYPE.FIRM : STANCE_TYPE.MODERATE;
    } else if (agentPersonality === 'Collaborative') {
      stance = STANCE_TYPE.FLEXIBLE;
    } else if (agentPersonality === 'Risk-Averse') {
      stance = currentRound >= 3 ? STANCE_TYPE.YIELDING : STANCE_TYPE.MODERATE;
    }

    const counterReasonText = this._generateDialogueText({
      agentId,
      agentPersonality,
      agentGoal: agentGoal || 'reach mutual agreement',
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
   * Calculates a counteroffer value stepping from startValue towards the current offer
   * while strictly respecting reservation limits and personality rates.
   */
  _calculateCounterOfferValue({
    agentMeta,
    agentPersonality,
    currentOfferValue,
    previousOfferValue,
    currentRound = 1,
    maxRounds = 5,
  }) {
    const { target, reservation, preferredDirection } = agentMeta;
    const startValue = previousOfferValue ?? target;

    // Step rates tailored per personality trait
    let stepRate = 0.05;
    if (agentPersonality === 'Aggressive') {
      stepRate = 0.04;
    } else if (agentPersonality === 'Collaborative') {
      stepRate = 0.12;
    } else if (agentPersonality === 'Risk-Averse') {
      stepRate = 0.08;
    }

    // Gradual concession acceleration as rounds advance towards deadline
    const roundProgress = maxRounds > 1 ? (currentRound - 1) / (maxRounds - 1) : 0;
    stepRate += roundProgress * 0.06;

    const gap = currentOfferValue - startValue;
    let nextValue = startValue + gap * stepRate;

    // Validate and clamp through ConcessionTracker safety rules
    const validation = validateConcession({
      proposedValue: nextValue,
      previousValue: startValue,
      target,
      reservation,
      preferredDirection,
      maxJumpFraction: 0.35,
    });
    nextValue = validation.clampedValue;

    // Strict boundary enforcement: never cross reservation or move past target
    if (preferredDirection === 'DECREASE') {
      nextValue = Math.min(nextValue, reservation);
      nextValue = Math.max(nextValue, target);
    } else {
      nextValue = Math.max(nextValue, reservation);
      nextValue = Math.min(nextValue, target);
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
