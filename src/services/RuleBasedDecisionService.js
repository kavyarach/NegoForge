import { DECISION_TYPE, STANCE_TYPE } from '../constants/negotiationConstants.js';
import { createOffer } from '../models/Offer.js';
import { MultiAttributeUtilityService } from './MultiAttributeUtilityService.js';

/**
 * Deterministic negotiation decision engine.
 *
 * Price remains the primary numeric value for backwards compatibility, while
 * all configured secondary terms contribute to the agent's utility score.
 */
export const RuleBasedDecisionService = {
  evaluateOffer({
    scenario,
    agentId,
    agentGoal,
    agentConstraint,
    agentPersonality = 'Collaborative',
    difficulty = 'Medium',
    currentOffer,
    previousOffer = null,
    currentRound = 1,
    maxRounds = 5,
    strategyOverride = null,
  }) {
    const currency = scenario?.currencySymbol || '$';
    const unit = scenario?.unit || 'price';
    const agentMeta = this._getAgentMeta(scenario, agentId);
    const normalizedStrategy = ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'].includes(String(strategyOverride || '').toUpperCase())
      ? String(strategyOverride).toUpperCase()
      : null;

    if (!currentOffer) {
      const initialValue = this._getInitialAgentOfferValue(scenario, agentId);
      const initialTerms = MultiAttributeUtilityService.buildInitialTerms(scenario, agentId);
      const initialOffer = createOffer({
        value: initialValue,
        terms: initialTerms,
        agentId,
        roundNumber: currentRound,
        reason: `Opening proposal aligned with my goal to ${agentGoal.toLowerCase()}.`,
      });

      return {
        decision: DECISION_TYPE.COUNTEROFFER,
        reason: `Hello! I would like to propose ${this._formatOffer(scenario, initialOffer)}. This package aligns with my goal to ${agentGoal.toLowerCase()}.`,
        counterOffer: initialOffer,
        stance: STANCE_TYPE.FIRM,
        utility: MultiAttributeUtilityService.scoreOffer(scenario, agentId, initialOffer),
        strategyOverrideApplied: normalizedStrategy,
      };
    }

    const { target, reservation, preferredDirection } = agentMeta;
    const offerVal = Number(currentOffer.value);
    const priceOutsideReservation = preferredDirection === 'DECREASE'
      ? offerVal > reservation
      : offerVal < reservation;

    const utilityResult = MultiAttributeUtilityService.scoreOffer(scenario, agentId, currentOffer);
    const utility = utilityResult.utility;
    const utilityThreshold = this._getAcceptanceThreshold({ agentPersonality, difficulty, currentRound, strategyOverride: normalizedStrategy });

    // A price target is still an immediate acceptance only when the whole
    // package is acceptable. This prevents a great price from hiding terrible
    // delivery/payment/warranty terms.
    const priceMeetsTarget = preferredDirection === 'DECREASE' ? offerVal <= target : offerVal >= target;
    if (priceMeetsTarget && utility >= Math.min(0.78, utilityThreshold)) {
      return {
        decision: DECISION_TYPE.ACCEPT,
        reason: `Offer of ${currency}${offerVal.toLocaleString()} meets or exceeds target of ${currency}${target.toLocaleString()}, and the complete package scores ${Math.round(utility * 100)}% against my weighted preferences. I am pleased to accept these terms.`,
        counterOffer: null,
        stance: STANCE_TYPE.YIELDING,
        utility: utilityResult,
        strategyOverrideApplied: normalizedStrategy,
      };
    }

    // Reject only when the package is clearly outside the agent's reservation
    // boundary or utility is critically low late in the negotiation.
    const priceReservationGap = Math.abs(offerVal - reservation) / Math.max(1, reservation);
    if (priceOutsideReservation && (utility < 0.12 || priceReservationGap > 0.25 || currentRound >= maxRounds)) {
      return {
        decision: DECISION_TYPE.REJECT,
        reason: `I cannot accept this package. The price of ${currency}${offerVal.toLocaleString()} violates my reservation constraint (${currency}${reservation.toLocaleString()}), and the overall package utility is only ${Math.round(utility * 100)}%. Since we cannot bridge the gap, I must decline.`,
        counterOffer: null,
        stance: STANCE_TYPE.STUBBORN,
        utility: utilityResult,
        strategyOverrideApplied: normalizedStrategy,
      };
    }

    if (utility >= utilityThreshold) {
      return {
        decision: DECISION_TYPE.ACCEPT,
        reason: `Considering our progress in round ${currentRound}, ${agentPersonality.toLowerCase()} strategy, and ${difficulty.toLowerCase()} difficulty, I accept this package. Its weighted utility is ${Math.round(utility * 100)}%, which is within my workable range.`,
        counterOffer: null,
        stance: STANCE_TYPE.FLEXIBLE,
        utility: utilityResult,
        strategyOverrideApplied: normalizedStrategy,
      };
    }

    const concessionRate = this._getConcessionRate({
      agentPersonality,
      difficulty,
      currentRound,
      strategyOverride: normalizedStrategy,
    });

    const counterValue = this._calculateCounterOfferValue({
      agentMeta,
      agentPersonality,
      difficulty,
      currentOfferValue: offerVal,
      previousOfferValue: previousOffer ? previousOffer.value : null,
      currentRound,
      strategyOverride: normalizedStrategy,
    });

    const counterTerms = MultiAttributeUtilityService.buildCounterTerms(
      scenario,
      agentId,
      currentOffer,
      concessionRate,
    );

    const counterOffer = createOffer({
      value: counterValue,
      terms: counterTerms,
      agentId,
      roundNumber: currentRound,
      reason: '',
    });

    const counterUtility = MultiAttributeUtilityService.scoreOffer(scenario, agentId, counterOffer);
    const tradeoffs = MultiAttributeUtilityService.describeTradeoffs(scenario, agentId, currentOffer, counterOffer);
    const counterReasonText = this._generateDialogueText({
      agentId,
      agentPersonality,
      agentGoal,
      currentOffer,
      counterOffer,
      currency,
      unit,
      currentRound,
      strategyOverride: normalizedStrategy,
      utility,
      counterUtility: counterUtility.utility,
      tradeoffs,
    });

    counterOffer.reason = counterReasonText;

    let stance = STANCE_TYPE.MODERATE;
    if (agentPersonality === 'Aggressive' && currentRound <= 2) stance = STANCE_TYPE.FIRM;
    else if (agentPersonality === 'Collaborative' || agentPersonality === 'Flexible') stance = STANCE_TYPE.FLEXIBLE;
    else if (agentPersonality === 'Risk-Averse' && currentRound >= 3) stance = STANCE_TYPE.YIELDING;

    return {
      decision: DECISION_TYPE.COUNTEROFFER,
      reason: counterReasonText,
      counterOffer,
      stance,
      utility: utilityResult,
      counterUtility,
      tradeoffs,
      strategyOverrideApplied: normalizedStrategy,
    };
  },

  _getAcceptanceThreshold({ agentPersonality, difficulty, currentRound, strategyOverride }) {
    let threshold = 0.70;
    if (agentPersonality === 'Aggressive') threshold = currentRound >= 4 ? 0.62 : 0.76;
    else if (agentPersonality === 'Collaborative') threshold = currentRound >= 3 ? 0.62 : 0.70;
    else if (agentPersonality === 'Analytical') threshold = currentRound >= 3 ? 0.66 : 0.74;
    else if (agentPersonality === 'Risk-Averse') threshold = currentRound >= 2 ? 0.78 : 0.84;
    else if (agentPersonality === 'Flexible') threshold = currentRound >= 2 ? 0.60 : 0.68;

    if (difficulty === 'Easy') threshold -= 0.08;
    else if (difficulty === 'Hard') threshold += 0.06;

    if (strategyOverride === 'CONSERVATIVE') threshold -= 0.06;
    else if (strategyOverride === 'AGGRESSIVE') threshold += 0.05;

    return Math.max(0.45, Math.min(0.92, threshold));
  },

  _getConcessionRate({ agentPersonality, difficulty, currentRound, strategyOverride }) {
    let rate = 0.10;
    if (agentPersonality === 'Aggressive') rate = 0.05;
    else if (agentPersonality === 'Collaborative') rate = 0.16;
    else if (agentPersonality === 'Analytical') rate = 0.10;
    else if (agentPersonality === 'Risk-Averse') rate = 0.08;
    else if (agentPersonality === 'Flexible') rate = 0.20;

    if (difficulty === 'Easy') rate += 0.05;
    else if (difficulty === 'Hard') rate = Math.max(0.03, rate - 0.03);

    rate += Math.min(0.08, (currentRound - 1) * 0.02);
    if (strategyOverride === 'CONSERVATIVE') rate += 0.06;
    else if (strategyOverride === 'AGGRESSIVE') rate = Math.max(0.02, rate - 0.04);

    return Math.max(0.02, Math.min(0.35, rate));
  },

  _getAgentMeta(scenario, agentId) {
    const defaultMeta = {
      target: scenario?.initialOfferValue ? scenario.initialOfferValue * 0.8 : 80000,
      reservation: scenario?.initialOfferValue ? scenario.initialOfferValue * 1.1 : 110000,
      preferredDirection: 'DECREASE',
    };

    const found = (scenario?.agents || []).find((a) => a.id === agentId || a.name === agentId);
    if (!found) return defaultMeta;

    const pricePreference = found.preferences?.price;
    return {
      target: Number(pricePreference?.ideal ?? found.baselineTarget ?? defaultMeta.target),
      reservation: Number(pricePreference?.reservation ?? found.baselineReservation ?? defaultMeta.reservation),
      preferredDirection: pricePreference?.direction ?? found.preferredDirection ?? 'DECREASE',
    };
  },

  _getInitialAgentOfferValue(scenario, agentId) {
    return this._getAgentMeta(scenario, agentId).target;
  },

  _calculateCounterOfferValue({
    agentMeta,
    agentPersonality,
    difficulty = 'Medium',
    currentOfferValue,
    previousOfferValue,
    currentRound,
    strategyOverride = null,
  }) {
    const { target, reservation, preferredDirection } = agentMeta;
    const startValue = previousOfferValue ?? target;
    const rate = this._getConcessionRate({ agentPersonality, difficulty, currentRound, strategyOverride });
    const nextValue = startValue + (currentOfferValue - startValue) * rate;

    if (preferredDirection === 'DECREASE') {
      return Math.round(Math.min(Math.max(nextValue, target), reservation));
    }
    return Math.round(Math.max(Math.min(nextValue, target), reservation));
  },

  _formatOffer(scenario, offer) {
    const currency = scenario?.currencySymbol || '$';
    const price = `${currency}${Number(offer.value).toLocaleString()}`;
    if (!offer?.terms || typeof offer.terms !== 'object') return `${price} ${scenario?.unit || 'price'}`;

    const definitions = scenario?.multiTerms || [];
    const termText = definitions
      .map((definition) => {
        const value = offer.terms[definition.name];
        return value === undefined ? null : `${definition.label}: ${value}${definition.unit ? ` ${definition.unit}` : ''}`;
      })
      .filter(Boolean)
      .join(', ');
    return `${price} + ${termText}`;
  },

  _generateDialogueText({
    agentPersonality,
    agentGoal,
    currentOffer,
    counterOffer,
    currency,
    currentRound,
    strategyOverride,
    utility,
    counterUtility,
    tradeoffs,
  }) {
    const currentPrice = `${currency}${Number(currentOffer.value).toLocaleString()}`;
    const counterPrice = `${currency}${Number(counterOffer.value).toLocaleString()}`;
    const tradeoffText = tradeoffs.length ? ` Key trade-offs: ${tradeoffs.join('; ')}.` : '';
    const strategyText = strategyOverride ? ` The ${strategyOverride.toLowerCase()} coach strategy is applied for this turn.` : '';

    if (agentPersonality === 'Aggressive') {
      return `Your package at ${currentPrice} scores ${Math.round(utility * 100)}% for my priorities. I am holding firm on ${agentGoal.toLowerCase()} and counter with ${counterPrice}, improving the package toward my highest-weight terms.${tradeoffText}${strategyText}`;
    }
    if (agentPersonality === 'Analytical') {
      return `I evaluated the full package rather than price alone: utility is ${Math.round(utility * 100)}%. In Round ${currentRound}, I can move to ${counterPrice}, raising package utility toward ${Math.round(counterUtility * 100)}%.${tradeoffText}${strategyText}`;
    }
    if (agentPersonality === 'Risk-Averse') {
      return `I want a safe agreement that protects my reservation boundaries. Your package scores ${Math.round(utility * 100)}%, so I can move to ${counterPrice} while improving the terms I value most.${tradeoffText}${strategyText}`;
    }
    if (agentPersonality === 'Flexible') {
      return `I appreciate the proposal. Its current utility is ${Math.round(utility * 100)}%, and I can trade across several terms to reach ${counterPrice} with a stronger overall package.${tradeoffText}${strategyText}`;
    }
    return `I would like to keep the negotiation collaborative. Your package scores ${Math.round(utility * 100)}%; I can move to ${counterPrice} if we also improve the other terms that matter to me.${tradeoffText}${strategyText}`;
  },
};
