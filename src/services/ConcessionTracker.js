import { CONCESSION_DIRECTION } from '../constants/negotiationConstants';

/**
 * Calculates concession metrics between a previous offer value and a current offer value.
 * Preserves backwards compatibility while supporting extended tracking options.
 *
 * @param {number|null} previousValue - Previous offer value
 * @param {number} currentValue - Current offer value
 * @param {Object} [options={}] - Optional metadata { initialPosition, cumulativeConcession, agentId }
 * @returns {Object} Concession calculation details
 */
export function calculateConcession(previousValue, currentValue, options = {}) {
  const curr = Number(currentValue);

  if (previousValue === null || previousValue === undefined) {
    const initial = options.initialPosition !== undefined && options.initialPosition !== null
      ? Number(options.initialPosition)
      : curr;

    return {
      previousValue: null,
      currentValue: curr,
      initialPosition: initial,
      previousPosition: null,
      currentPosition: curr,
      concessionAmount: 0,
      concessionPercentage: 0,
      direction: CONCESSION_DIRECTION.NO_CHANGE,
      cumulativeConcession: options.cumulativeConcession !== undefined ? Number(options.cumulativeConcession) : 0,
    };
  }

  const prev = Number(previousValue);
  const initial = options.initialPosition !== undefined && options.initialPosition !== null
    ? Number(options.initialPosition)
    : prev;

  const concessionAmount = Math.abs(curr - prev);
  const concessionPercentage = prev !== 0 ? (concessionAmount / Math.abs(prev)) * 100 : 0;

  let direction = CONCESSION_DIRECTION.NO_CHANGE;
  if (curr > prev) {
    direction = CONCESSION_DIRECTION.INCREASE;
  } else if (curr < prev) {
    direction = CONCESSION_DIRECTION.DECREASE;
  }

  const priorCumulative = options.cumulativeConcession !== undefined && options.cumulativeConcession !== null
    ? Number(options.cumulativeConcession)
    : 0;
  const cumulativeConcession = priorCumulative + concessionAmount;

  return {
    previousValue: prev,
    currentValue: curr,
    initialPosition: initial,
    previousPosition: prev,
    currentPosition: curr,
    concessionAmount: Number(concessionAmount.toFixed(2)),
    concessionPercentage: Number(concessionPercentage.toFixed(2)),
    direction,
    cumulativeConcession: Number(cumulativeConcession.toFixed(2)),
  };
}

/**
 * Tracks and aggregates concession records for a specific agent across negotiation history.
 *
 * @param {Array} history - Full negotiation history
 * @param {string} agentId - Target agent ID
 * @param {number} currentOfferValue - The offer currently being submitted
 * @returns {Object} Agent-specific concession summary with opponent context
 */
export function trackAgentConcessions(history = [], agentId, currentOfferValue) {
  const agentEvents = history.filter(
    (h) => h.agent === agentId && h.offer && typeof h.offer.value === 'number'
  );

  const initialPosition = agentEvents.length > 0 ? agentEvents[0].offer.value : currentOfferValue;
  const previousPosition = agentEvents.length > 0 ? agentEvents[agentEvents.length - 1].offer.value : null;

  const priorCumulative = agentEvents.reduce((acc, ev) => {
    return acc + (ev.concession?.concessionAmount || 0);
  }, 0);

  const concession = calculateConcession(previousPosition, currentOfferValue, {
    initialPosition,
    cumulativeConcession: priorCumulative,
    agentId,
  });

  const opponentEvents = history.filter(
    (h) => h.agent !== agentId && h.offer && typeof h.offer.value === 'number'
  );
  const opponentCumulative = opponentEvents.reduce((acc, ev) => {
    return acc + (ev.concession?.concessionAmount || 0);
  }, 0);
  const opponentLatestConcession = opponentEvents.length > 0
    ? opponentEvents[opponentEvents.length - 1].concession || null
    : null;

  return {
    ...concession,
    agentId,
    priorCumulative: Number(priorCumulative.toFixed(2)),
    cumulativeConcession: concession.cumulativeConcession,
    opponentInfo: {
      opponentCumulativeConcession: Number(opponentCumulative.toFixed(2)),
      opponentLatestConcession,
    },
  };
}

/**
 * Validates whether a proposed counteroffer stays within acceptable boundaries
 * and does not constitute an excessive or unrealistic jump.
 *
 * @param {Object} params
 * @returns {Object} { isValid: boolean, clampedValue: number, reason: string }
 */
export function validateConcession({
  proposedValue,
  previousValue,
  target,
  reservation,
  preferredDirection,
  maxJumpFraction = 0.35,
}) {
  const prop = Number(proposedValue);
  const isWantsDecrease = preferredDirection === 'DECREASE';
  const totalRange = Math.abs(reservation - target) || 1;
  const maxAllowedStep = Math.max(totalRange * maxJumpFraction, 1);

  let clamped = prop;
  let reason = 'Valid concession within safe boundaries.';
  let isValid = true;

  // Rule 1: Never cross reservation boundary
  if (isWantsDecrease) {
    if (prop > reservation) {
      clamped = reservation;
      isValid = false;
      reason = `Proposed offer ${prop} exceeded maximum reservation limit ${reservation}. Clamped to reservation.`;
    }
  } else {
    if (prop < reservation) {
      clamped = reservation;
      isValid = false;
      reason = `Proposed offer ${prop} fell below minimum reservation limit ${reservation}. Clamped to reservation.`;
    }
  }

  // Rule 2: Guard against unrealistic jumps from previous position
  if (previousValue !== null && previousValue !== undefined) {
    const prev = Number(previousValue);
    const step = Math.abs(clamped - prev);

    if (step > maxAllowedStep * 1.5) {
      isValid = false;
      const stepDirection = isWantsDecrease ? 1 : -1;
      clamped = Math.round(prev + stepDirection * maxAllowedStep);
      if (isWantsDecrease) {
        clamped = Math.min(clamped, reservation);
      } else {
        clamped = Math.max(clamped, reservation);
      }
      reason = `Unrealistic concession jump of ${step}. Clamped to max allowable step (${maxAllowedStep.toFixed(0)}).`;
    }
  }

  return {
    isValid,
    clampedValue: clamped,
    reason,
  };
}
