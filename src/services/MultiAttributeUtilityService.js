/**
 * Multi-attribute utility engine.
 *
 * Every negotiable term is scored from 0..1 for a specific agent. A score of
 * 1 represents the agent's preferred/target value and 0 represents the
 * reservation boundary. This lets the decision engine trade one term for
 * another instead of treating price as the only thing that matters.
 */
export const MultiAttributeUtilityService = {
  getAgentProfile(scenario, agentId) {
    const agent = (scenario?.agents || []).find((item) => (item.id || item.name) === agentId);
    return agent || null;
  },

  getPreferences(scenario, agentId) {
    const agent = this.getAgentProfile(scenario, agentId);
    return agent?.preferences || {};
  },

  buildInitialTerms(scenario, agentId) {
    const terms = {};
    const preferences = this.getPreferences(scenario, agentId);

    (scenario?.multiTerms || []).forEach((definition) => {
      const preference = preferences[definition.name];
      if (preference && Object.prototype.hasOwnProperty.call(preference, 'ideal')) {
        terms[definition.name] = preference.ideal;
      } else {
        terms[definition.name] = definition.default;
      }
    });

    return terms;
  },

  normalizeTerm(definition, value, preference = {}) {
    if (value === undefined || value === null || value === '') return 0.5;

    if (Array.isArray(definition?.options)) {
      const order = preference.order || definition.options;
      const index = order.indexOf(value);
      if (index < 0) return 0;
      if (order.length <= 1) return 1;
      return 1 - (index / (order.length - 1));
    }

    const numericValue = Number(value);
    const ideal = Number(preference.ideal);
    const reservation = Number(preference.reservation);
    if (![numericValue, ideal, reservation].every(Number.isFinite)) return 0.5;

    const direction = preference.direction || 'INCREASE';
    const denominator = Math.abs(ideal - reservation) || 1;
    const raw = direction === 'DECREASE'
      ? (reservation - numericValue) / denominator
      : (numericValue - reservation) / denominator;

    return Math.max(0, Math.min(1, raw));
  },

  scoreOffer(scenario, agentId, offer) {
    const preferences = this.getPreferences(scenario, agentId);
    const definitions = scenario?.multiTerms || [];
    const weights = [];
    let weightedScore = 0;

    const pricePreference = preferences.price || {
      weight: 1,
      ideal: this.getAgentProfile(scenario, agentId)?.baselineTarget,
      reservation: this.getAgentProfile(scenario, agentId)?.baselineReservation,
      direction: this.getAgentProfile(scenario, agentId)?.preferredDirection || 'DECREASE',
    };

    const priceWeight = Number(pricePreference.weight ?? 0.5);
    const priceScore = this.normalizeTerm({ name: 'price' }, offer?.value, pricePreference);
    weights.push({ term: 'price', weight: priceWeight, score: priceScore, value: offer?.value });
    weightedScore += priceWeight * priceScore;

    definitions.forEach((definition) => {
      const preference = preferences[definition.name];
      if (!preference) return;
      const weight = Number(preference.weight ?? 0);
      if (weight <= 0) return;
      const value = offer?.terms && typeof offer.terms === 'object'
        ? offer.terms[definition.name]
        : definition.default;
      const score = this.normalizeTerm(definition, value, preference);
      weights.push({ term: definition.name, weight, score, value });
      weightedScore += weight * score;
    });

    const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0) || 1;
    const utility = weightedScore / totalWeight;
    return {
      utility: Number(utility.toFixed(4)),
      breakdown: weights.map((item) => ({
        ...item,
        contribution: Number(((item.weight / totalWeight) * item.score).toFixed(4)),
      })),
    };
  },

  isWithinReservation(scenario, agentId, offer) {
    const profile = this.getAgentProfile(scenario, agentId);
    if (!profile) return true;

    const pricePref = this.getPreferences(scenario, agentId).price;
    const direction = pricePref?.direction || profile.preferredDirection;
    const reservation = Number(pricePref?.reservation ?? profile.baselineReservation);
    if (!Number.isFinite(Number(offer?.value)) || !Number.isFinite(reservation)) return false;

    const priceOkay = direction === 'DECREASE'
      ? Number(offer.value) <= reservation
      : Number(offer.value) >= reservation;

    if (!priceOkay) return false;

    return (scenario?.multiTerms || []).every((definition) => {
      const preference = this.getPreferences(scenario, agentId)[definition.name];
      if (!preference || preference.reservation === undefined) return true;
      const value = offer?.terms && typeof offer.terms === 'object' ? offer.terms[definition.name] : undefined;
      if (value === undefined) return true;
      if (Array.isArray(definition.options)) {
        return definition.options.includes(value);
      }
      const numericValue = Number(value);
      const reservationValue = Number(preference.reservation);
      if (!Number.isFinite(numericValue) || !Number.isFinite(reservationValue)) return true;
      return preference.direction === 'DECREASE'
        ? numericValue <= reservationValue
        : numericValue >= reservationValue;
    });
  },

  buildCounterTerms(scenario, agentId, currentOffer, concessionRate = 0.1) {
    const preferences = this.getPreferences(scenario, agentId);
    const definitions = scenario?.multiTerms || [];
    const currentTerms = currentOffer?.terms && typeof currentOffer.terms === 'object'
      ? { ...currentOffer.terms }
      : this.buildInitialTerms(scenario, agentId);

    definitions.forEach((definition) => {
      const preference = preferences[definition.name];
      if (!preference || preference.ideal === undefined) return;
      const current = currentTerms[definition.name] ?? definition.default;

      if (Array.isArray(definition.options)) {
        const order = preference.order || definition.options;
        const currentIndex = Math.max(0, order.indexOf(current));
        const idealIndex = Math.max(0, order.indexOf(preference.ideal));
        const nextIndex = Math.round(currentIndex + (idealIndex - currentIndex) * concessionRate);
        currentTerms[definition.name] = order[Math.max(0, Math.min(order.length - 1, nextIndex))];
        return;
      }

      const numericCurrent = Number(current);
      const numericIdeal = Number(preference.ideal);
      if (!Number.isFinite(numericCurrent) || !Number.isFinite(numericIdeal)) return;

      const next = numericCurrent + (numericIdeal - numericCurrent) * concessionRate;
      const min = Number(definition.min);
      const max = Number(definition.max);
      const clamped = Number.isFinite(min) && Number.isFinite(max)
        ? Math.max(min, Math.min(max, next))
        : next;
      currentTerms[definition.name] = Number.isInteger(numericCurrent) ? Math.round(clamped) : Number(clamped.toFixed(2));
    });

    return currentTerms;
  },

  describeTradeoffs(scenario, agentId, previousOffer, nextOffer) {
    const preferences = this.getPreferences(scenario, agentId);
    const definitions = scenario?.multiTerms || [];
    const changes = [];

    if (previousOffer && nextOffer && previousOffer.value !== nextOffer.value) {
      changes.push(`price ${previousOffer.value} → ${nextOffer.value}`);
    }

    definitions.forEach((definition) => {
      const before = previousOffer?.terms && typeof previousOffer.terms === 'object'
        ? previousOffer.terms[definition.name]
        : undefined;
      const after = nextOffer?.terms && typeof nextOffer.terms === 'object'
        ? nextOffer.terms[definition.name]
        : undefined;
      if (before === undefined || after === undefined || before === after) return;
      const preference = preferences[definition.name];
      const direction = preference?.direction;
      const favorable = direction === 'DECREASE' ? Number(after) < Number(before) : Number(after) > Number(before);
      changes.push(`${definition.label || definition.name} ${before} → ${after}${favorable ? ' ✓' : ''}`);
    });

    return changes;
  },
};
