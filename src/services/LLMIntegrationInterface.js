import { RuleBasedDecisionService } from './RuleBasedDecisionService';
import { createAgentInput } from '../models/AgentInput';
import { createOffer } from '../models/Offer';
import { DECISION_TYPE, STANCE_TYPE } from '../constants/negotiationConstants';
import { validateConcession } from './ConcessionTracker';

/**
 * Reads API key securely from environment variables without exposing secrets.
 */
export function getLlmApiKey() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return (
        import.meta.env.VITE_LLM_API_KEY ||
        import.meta.env.VITE_GEMINI_API_KEY ||
        import.meta.env.VITE_OPENAI_API_KEY ||
        ''
      );
    }
  } catch {
    // Ignore environment access errors in environments without import.meta
  }

  try {
    const proc = typeof globalThis !== 'undefined' ? globalThis.process : undefined;
    if (proc && proc.env) {
      return (
        proc.env.VITE_LLM_API_KEY ||
        proc.env.GEMINI_API_KEY ||
        proc.env.OPENAI_API_KEY ||
        ''
      );
    }
  } catch {
    // Ignore environment access errors
  }

  return '';
}

/**
 * Builds structured prompt context for LLM reasoning.
 */
export function buildLLMPromptContext({
  agentInput,
  agentMeta,
  deterministicResult,
  currentRound,
  maxRounds = 5,
  opponentOffer,
  history = [],
}) {
  return {
    agentRole: agentInput.role,
    goal: agentInput.goals,
    target: agentMeta.target,
    constraints: agentInput.constraints,
    reservationLimit: agentMeta.reservation,
    preferredDirection: agentMeta.preferredDirection,
    personality: agentInput.persona,
    opponentRole: opponentOffer?.agentId || 'Counterpart',
    opponentOffer: opponentOffer
      ? {
          value: opponentOffer.value,
          roundNumber: opponentOffer.roundNumber,
          terms: opponentOffer.terms,
          reason: opponentOffer.reason,
        }
      : null,
    currentRound,
    maxRounds,
    negotiationHistory: history.map((h) => ({
      round: h.round,
      agent: h.agent,
      action: h.action || h.decision,
      value: h.offer?.value ?? null,
      reason: h.reason,
    })),
    deterministicBaseline: {
      recommendedDecision: deterministicResult.decision,
      recommendedOffer: deterministicResult.counterOffer?.value ?? null,
      stance: deterministicResult.stance,
    },
    expectedOutputFormat: {
      decision: 'ACCEPT | COUNTER | REJECT',
      offer: 'number or null',
      reasoning: 'string',
    },
  };
}

/**
 * Validates LLM output against hard constraints and ensures realistic concessions.
 * Never allows the LLM to violate reservation prices or produce invalid structures.
 */
export function validateLLMResponse({
  rawResponse,
  agentMeta,
  agentId,
  currentRound,
  currency = '$',
  unit = 'price',
  previousOfferValue = null,
}) {
  if (!rawResponse || typeof rawResponse !== 'object') {
    return { isValid: false, error: 'LLM response must be an object' };
  }

  let decision = String(rawResponse.decision || '').toUpperCase().trim();
  if (decision === 'COUNTER') {
    decision = DECISION_TYPE.COUNTEROFFER;
  }

  if (![DECISION_TYPE.ACCEPT, DECISION_TYPE.REJECT, DECISION_TYPE.COUNTEROFFER].includes(decision)) {
    return { isValid: false, error: `Invalid decision '${decision}' from LLM` };
  }

  const reasoning = typeof rawResponse.reasoning === 'string' && rawResponse.reasoning.trim().length > 0
    ? rawResponse.reasoning.trim()
    : 'Evaluated current offer against constraints and goals.';

  // For ACCEPT or REJECT, offer should be null (or matching currentOffer)
  if (decision === DECISION_TYPE.ACCEPT) {
    return {
      isValid: true,
      decision: DECISION_TYPE.ACCEPT,
      counterOffer: null,
      reason: reasoning,
      stance: STANCE_TYPE.YIELDING,
    };
  }

  if (decision === DECISION_TYPE.REJECT) {
    return {
      isValid: true,
      decision: DECISION_TYPE.REJECT,
      counterOffer: null,
      reason: reasoning,
      stance: STANCE_TYPE.STUBBORN,
    };
  }

  // For COUNTEROFFER, validate proposed value against reservation boundaries
  const proposedValue = Number(rawResponse.offer);
  if (isNaN(proposedValue) || proposedValue <= 0) {
    return { isValid: false, error: 'Counteroffer must specify a positive numeric offer value' };
  }

  const { target, reservation, preferredDirection } = agentMeta;
  const isWantsDecrease = preferredDirection === 'DECREASE';

  // Hard safety constraint: LLM must NEVER violate reservation limit
  if (isWantsDecrease && proposedValue > reservation) {
    return {
      isValid: false,
      error: `LLM counteroffer ${proposedValue} violated maximum reservation limit ${reservation}`,
    };
  }
  if (!isWantsDecrease && proposedValue < reservation) {
    return {
      isValid: false,
      error: `LLM counteroffer ${proposedValue} violated minimum reservation limit ${reservation}`,
    };
  }

  // Validate concession step realism
  const validation = validateConcession({
    proposedValue,
    previousValue: previousOfferValue ?? target,
    target,
    reservation,
    preferredDirection,
    maxJumpFraction: 0.35,
  });

  if (!validation.isValid) {
    return {
      isValid: false,
      error: `LLM proposal rejected due to excessive concession: ${validation.reason}`,
    };
  }

  const counterOffer = createOffer({
    value: proposedValue,
    terms: `Counterproposal of ${currency}${proposedValue.toLocaleString()} ${unit}`,
    agentId,
    roundNumber: currentRound,
    reason: reasoning,
  });

  return {
    isValid: true,
    decision: DECISION_TYPE.COUNTEROFFER,
    counterOffer,
    reason: reasoning,
    stance: STANCE_TYPE.MODERATE,
  };
}

/**
 * Generates an agent response (OFFER, COUNTEROFFER, ACCEPT, or REJECT).
 * Uses deterministic RuleBasedDecisionService as the foundational safety layer.
 * If LLM credentials and provider are present, attempts LLM reasoning with strict validation
 * and falls back seamlessly if anything fails.
 *
 * @param {Object} agentProfile - Standard agent input or profile object
 * @param {Object} negotiationState - Current negotiation state
 * @param {Array} history - Full negotiation history
 * @param {Function|null} [customLlmCaller=null] - Optional LLM caller for testing or custom provider
 * @returns {Object} { decision, reason, counterOffer, stance, agentInputUsed, isMockResponse, source }
 */
export function generate_agent_response(
  agentProfile,
  negotiationState,
  history = [],
  customLlmCaller = null
) {
  const input = agentProfile.persona
    ? agentProfile
    : createAgentInput({
        agentId: agentProfile.id || agentProfile.agentId || negotiationState.currentAgentTurn,
        scenario: negotiationState.scenario,
        agentGoals: negotiationState.agentGoals,
        agentConstraints: negotiationState.agentConstraints,
        agentPersonality: negotiationState.agentPersonality,
        negotiationState,
        history: history.length ? history : negotiationState.negotiationHistory,
        opponentOffer: negotiationState.currentOffer,
      });

  const agentId = input.agentId;
  const scenario = negotiationState.scenario;
  const currentOffer = negotiationState.currentOffer;
  const previousOffer = negotiationState.previousOffer;
  const currentRound = negotiationState.currentRound;
  const maxRounds = 5;

  // Compute deterministic baseline (safety layer)
  const deterministicResult = RuleBasedDecisionService.evaluateOffer({
    scenario,
    agentId,
    agentGoal: input.goals,
    agentConstraint: input.constraints,
    agentPersonality: input.persona,
    currentOffer,
    previousOffer,
    currentRound,
    maxRounds,
    negotiationState,
    concessionHistory: negotiationState.negotiationHistory,
  });

  const apiKey = getLlmApiKey();
  const shouldAttemptLlm = Boolean(apiKey || customLlmCaller);

  if (shouldAttemptLlm && typeof customLlmCaller === 'function') {
    try {
      const agentMeta = RuleBasedDecisionService._getAgentMeta(scenario, agentId);
      const promptContext = buildLLMPromptContext({
        agentInput: input,
        agentMeta,
        deterministicResult,
        currentRound,
        maxRounds,
        opponentOffer: currentOffer,
        history: history.length ? history : negotiationState.negotiationHistory,
      });

      const rawLlmOutput = customLlmCaller(promptContext);
      const validated = validateLLMResponse({
        rawResponse: rawLlmOutput,
        agentMeta,
        agentId,
        currentRound,
        currency: scenario?.currencySymbol || '$',
        unit: scenario?.unit || 'price',
        previousOfferValue: previousOffer?.value ?? null,
      });

      if (validated.isValid) {
        return {
          decision: validated.decision,
          reason: validated.reason,
          counterOffer: validated.counterOffer,
          stance: validated.stance || deterministicResult.stance || 'Moderate',
          agentInputUsed: input,
          isMockResponse: false,
          source: 'LLM',
        };
      } else {
        // LLM failed validation; fall back safely to deterministic result
        return {
          decision: deterministicResult.decision,
          reason: deterministicResult.reason,
          counterOffer: deterministicResult.counterOffer,
          stance: deterministicResult.stance || 'Moderate',
          agentInputUsed: input,
          isMockResponse: true,
          source: 'DETERMINISTIC_FALLBACK',
          fallbackReason: validated.error,
        };
      }
    } catch {
      // Any error in LLM execution falls back safely
      return {
        decision: deterministicResult.decision,
        reason: deterministicResult.reason,
        counterOffer: deterministicResult.counterOffer,
        stance: deterministicResult.stance || 'Moderate',
        agentInputUsed: input,
        isMockResponse: true,
        source: 'DETERMINISTIC_FALLBACK',
      };
    }
  }

  // Default deterministic response when no LLM provider is active
  return {
    decision: deterministicResult.decision,
    reason: deterministicResult.reason,
    counterOffer: deterministicResult.counterOffer,
    stance: deterministicResult.stance || 'Moderate',
    agentInputUsed: input,
    isMockResponse: true,
    source: 'RULE_BASED',
  };
}

export const generateAgentResponse = generate_agent_response;

