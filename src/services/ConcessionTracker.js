import { CONCESSION_DIRECTION } from '../constants/negotiationConstants';

/**
 * Calculates concession metrics between a previous offer value and a current offer value.
 *
 * @param {number|null} previousValue - Previous offer value
 * @param {number} currentValue - Current offer value
 * @returns {Object} Concession calculation details
 */
export function calculateConcession(previousValue, currentValue) {
  if (previousValue === null || previousValue === undefined) {
    return {
      previousValue: null,
      currentValue: Number(currentValue),
      concessionAmount: 0,
      concessionPercentage: 0,
      direction: CONCESSION_DIRECTION.NO_CHANGE,
    };
  }

  const prev = Number(previousValue);
  const curr = Number(currentValue);

  const concessionAmount = Math.abs(curr - prev);
  const concessionPercentage = prev !== 0 ? (concessionAmount / Math.abs(prev)) * 100 : 0;

  let direction = CONCESSION_DIRECTION.NO_CHANGE;
  if (curr > prev) {
    direction = CONCESSION_DIRECTION.INCREASE;
  } else if (curr < prev) {
    direction = CONCESSION_DIRECTION.DECREASE;
  }

  return {
    previousValue: prev,
    currentValue: curr,
    concessionAmount: Number(concessionAmount.toFixed(2)),
    concessionPercentage: Number(concessionPercentage.toFixed(2)),
    direction,
  };
}
