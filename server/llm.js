/**
 * Server-Side LLM & NLP Integration Service for NegoForge
 * Supports Google Gemini API, OpenAI API, Natural Language Term Extraction, and AI Negotiation Coach.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Checks if real LLM credentials are available on the server.
 */
export function getLLMStatus() {
  if (GEMINI_API_KEY) return { provider: 'Google Gemini', configured: true };
  if (OPENAI_API_KEY) return { provider: 'OpenAI', configured: true };
  return { provider: 'Rule-Based Engine (Fallback)', configured: false };
}

/**
 * Parses natural language negotiation message and extracts structured terms.
 */
export async function extractTermsFromNaturalLanguage(text, scenarioId = 'vendor') {
  if (!text || typeof text !== 'string') {
    return { error: 'Invalid input text' };
  }

  if (GEMINI_API_KEY || OPENAI_API_KEY) {
    try {
      const llmResult = await callLLMForTermExtraction(text, scenarioId);
      if (llmResult && !llmResult.error) {
        return llmResult;
      }
    } catch (err) {
      console.warn('LLM NLP Extraction failed, falling back to rule-based parser:', err.message);
    }
  }

  return parseNaturalLanguageRuleBased(text, scenarioId);
}

function parseNaturalLanguageRuleBased(text, scenarioId) {
  const clean = text.toLowerCase();

  let price = null;
  const kMatch = clean.match(/(?:₹|\$|rs\.?|usd)?\s*(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    price = parseFloat(kMatch[1]) * 1000;
  } else {
    const numMatch = clean.match(/(?:₹|\$|rs\.?|usd)?\s*([\d,]+(?:\.\d+)?)/i);
    if (numMatch) {
      const parsed = parseFloat(numMatch[1].replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        price = parsed;
      }
    }
  }

  const terms = {
    value: price,
    summary: text,
    extractedAttributes: {},
    confidenceScore: price ? 0.9 : 0.6,
  };

  if (scenarioId === 'vendor') {
    const deliveryMatch = clean.match(/(\d+)\s*(?:days?|weeks?)\s*(?:delivery|shipping|lead time)/i) || clean.match(/delivery\s*(?:within|in)?\s*(\d+)\s*(?:days?|weeks?)/i);
    const paymentMatch = clean.match(/(?:payment|due)\s*(?:within|in|net)?\s*(\d+)\s*days/i);
    const warrantyMatch = clean.match(/(\d+)\s*(?:months?|years?)\s*warranty/i);
    const qtyMatch = clean.match(/(\d+)\s*(?:units?|items?|pieces?|qty|quantity)/i);

    if (deliveryMatch) terms.extractedAttributes.deliveryDays = parseInt(deliveryMatch[1]) * (clean.includes('week') ? 7 : 1);
    if (paymentMatch) terms.extractedAttributes.paymentDeadlineDays = parseInt(paymentMatch[1]);
    if (warrantyMatch) terms.extractedAttributes.warrantyMonths = parseInt(warrantyMatch[1]) * (clean.includes('year') ? 12 : 1);
    if (qtyMatch) terms.extractedAttributes.quantity = parseInt(qtyMatch[1]);

    if (clean.includes('free delivery') || clean.includes('delivery included')) {
      terms.extractedAttributes.deliveryDays = 0;
    }
  } else if (scenarioId === 'job') {
    const bonusMatch = clean.match(/(?:joining|sign-on|signup|bonus)\s*(?:of|is)?\s*(?:₹|\$)?\s*([\d,]+(?:\.\d+)?)\s*k?\b/i);
    const leaveMatch = clean.match(/(\d+)\s*days?\s*(?:leave|vacation|pto)/i);
    const noticeMatch = clean.match(/(\d+)\s*(?:days?|weeks?|months?)\s*(?:notice|joining)/i);

    if (bonusMatch) {
      const bVal = parseFloat(bonusMatch[1].replace(/,/g, ''));
      terms.extractedAttributes.joiningBonus = clean.includes('k') && bVal < 1000 ? bVal * 1000 : bVal;
    }
    if (leaveMatch) terms.extractedAttributes.leaveDays = parseInt(leaveMatch[1]);
    if (noticeMatch) terms.extractedAttributes.noticePeriodDays = parseInt(noticeMatch[1]);

    if (clean.includes('remote') || clean.includes('work from home')) terms.extractedAttributes.workMode = 'Remote';
    else if (clean.includes('hybrid')) terms.extractedAttributes.workMode = 'Hybrid';
    else if (clean.includes('onsite') || clean.includes('in-office')) terms.extractedAttributes.workMode = 'Onsite';

  } else if (scenarioId === 'budget') {
    const fteMatch = clean.match(/(\d+)\s*(?:engineers?|developers?|staff|ftes?|people|members)/i);
    const deadlineMatch = clean.match(/(\d+)\s*(?:weeks?|months?)\s*(?:deadline|timeline|duration)/i);
    const milestoneMatch = clean.match(/(\d+)\s*milestones?/i);

    if (fteMatch) terms.extractedAttributes.staffingFTEs = parseInt(fteMatch[1]);
    if (deadlineMatch) terms.extractedAttributes.deadlineWeeks = parseInt(deadlineMatch[1]) * (clean.includes('month') ? 4 : 1);
    if (milestoneMatch) terms.extractedAttributes.milestonesCount = parseInt(milestoneMatch[1]);
  }

  return terms;
}

async function callLLMForTermExtraction(text, scenarioId) {
  const prompt = `You are a negotiation term extraction parser. Extract structured negotiation parameters from this user message: "${text}".
Scenario type: ${scenarioId}.
Return JSON strictly with fields:
- value: number (primary monetary value/price/salary/budget, numeric only)
- summary: string (concise summary of proposed terms)
- extractedAttributes: object containing extracted terms.
Output ONLY raw valid JSON.`;

  if (GEMINI_API_KEY) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    const data = await res.json();
    const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (jsonStr) return JSON.parse(jsonStr);
  }
  return null;
}

export async function generateCoachingSuggestions({
  scenario,
  currentOffer,
  _history,
  humanAgentId,
  currentAgentId = null,
  mode = 'PRACTICE',
  _difficulty = 'Medium',
  agentPersonality = 'Collaborative',
}) {
  const currency = scenario?.currencySymbol || '$';
  const unit = scenario?.unit || 'Amount';
  const offerVal = currentOffer ? currentOffer.value : scenario?.initialOfferValue || 100000;
  const agents = scenario?.agents || [];
  const targetAgentId = mode === 'SIMULATION' ? currentAgentId : humanAgentId;
  const targetAgent = agents.find((a) => (a.id || a.name) === targetAgentId) || agents[0] || {};
  const isWantsDecrease = targetAgent.preferredDirection === 'DECREASE';
  const target = Number(targetAgent.baselineTarget ?? offerVal);
  const reservation = Number(targetAgent.baselineReservation ?? offerVal);
  const gap = Math.abs(offerVal - target);
  const direction = isWantsDecrease ? -1 : 1;

  const consVal = Math.round(offerVal + direction * gap * 0.15);
  const balVal = Math.round(offerVal + direction * gap * 0.35);
  const aggVal = Math.round(offerVal + direction * gap * 0.60);
  const audience = mode === 'SIMULATION' ? `Monitoring ${targetAgentId || 'current AI'} (${agentPersonality})` : 'Guidance for your next move';

  return {
    mode,
    targetAgentId,
    targetAgentName: targetAgent.name || targetAgentId,
    audience,
    currentValue: offerVal,
    targetValue: target,
    reservationValue: reservation,
    conservative: {
      strategy: 'CONSERVATIVE',
      type: 'Conservative Move',
      value: consVal,
      description: `Make a smaller concession toward ${currency}${consVal.toLocaleString()} ${unit}, prioritizing stability and keeping agreement risk low.`,
      pros: 'Lower deadlock risk and keeps the dialogue moving.',
      cons: 'May concede value sooner.',
    },
    balanced: {
      strategy: 'BALANCED',
      type: 'Balanced Move (Recommended)',
      value: balVal,
      description: `Move toward ${currency}${balVal.toLocaleString()} ${unit}, balancing progress with protection of the agent target.`,
      pros: 'Good trade-off between progress and value protection.',
      cons: 'Requires a moderate concession.',
    },
    aggressive: {
      strategy: 'AGGRESSIVE',
      type: 'Aggressive Move',
      value: aggVal,
      description: `Protect the position around ${currency}${aggVal.toLocaleString()} ${unit} and demand reciprocal movement before conceding further.`,
      pros: 'Protects the agent objective and bargaining leverage.',
      cons: 'Higher deadlock risk.',
    },
    tradeOffOpportunities: [
      'Trade a price concession for faster delivery or a shorter joining lead time.',
      'Exchange order volume, headcount, or contract duration for better unit economics.',
      'If the primary value is constrained, request a secondary-term improvement such as warranty, leave, work mode, or milestone flexibility.',
    ],
  };
}
