/**
 * Standard Offer Structure representation and factory.
 *
 * `terms` may be a legacy human-readable string or a structured object of
 * negotiable attributes. The latter is used by the multi-attribute engine.
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
  const numericValue = Number(value);
  const normalizedTerms = terms && typeof terms === 'object'
    ? { ...terms }
    : (terms || `Offer amount of ${value}`);

  return {
    offerId: offerId || `offer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    value: numericValue,
    terms: normalizedTerms,
    agentId,
    roundNumber: Number(roundNumber),
    reason,
    timestamp: timestamp || new Date().toISOString(),
  };
}

export function getStructuredTerms(offer) {
  return offer?.terms && typeof offer.terms === 'object' && !Array.isArray(offer.terms)
    ? { ...offer.terms }
    : {};
}
