/**
 * Standard Offer Structure representation and factory.
 */
export function createOffer({
  offerId,
  value,
  terms = '',
  agentId,
  roundNumber,
  reason = '',
  timestamp,
}) {
  return {
    offerId: offerId || `offer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    value: Number(value),
    terms: terms || `Offer amount of ${value}`,
    agentId,
    roundNumber: Number(roundNumber),
    reason,
    timestamp: timestamp || new Date().toISOString(),
  };
}
