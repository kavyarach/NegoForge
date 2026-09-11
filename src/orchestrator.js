// ============================================
// NEGOTIATION STATE MODEL
// ============================================

export function createNegotiationState(agent1, agent2) {
  return {
    currentRound: 1,
    currentAgent: agent1.name,

    agents: [agent1.name, agent2.name],

    status: 'ongoing',

    // Initial offers
    offers: [],

    // Counteroffers
    counteroffers: [],

    // Accept / Reject decisions
    decisions: [],

    // Complete conversation history
    history: [],
  }
}


// ============================================
// STANDARD AGENT INPUT STRUCTURE
// ============================================

export function createAgentInput(
  agent,
  negotiationState,
  history,
  opponentOffer
) {
  return {
    agentPersona: agent.personality,
    role: agent.role,
    goals: agent.goal,
    constraints: agent.constraint,

    currentNegotiationState: negotiationState,

    previousConversation: history,

    currentOpponentOffer: opponentOffer,
  }
}


// ============================================
// MOCK AGENT RESPONSE
// This will later be replaced by an LLM
// ============================================

export function generateAgentResponse(
  agentProfile,
  negotiationState,
  history
) {
  // ==========================================
  // VENDOR PRICING NEGOTIATION
  // Buyer vs Vendor
  // ==========================================

  const isBuyer = agentProfile.name === 'Buyer'
  const isVendor = agentProfile.name === 'Vendor'


  // ------------------------------------------
  // FIRST OFFER
  // ------------------------------------------

  if (history.length === 0) {

    if (isBuyer) {
      return {
        type: 'offer',
        amount: 800,
        message:
          'I would like to buy this product for ₹800.',
      }
    }

    if (isVendor) {
      return {
        type: 'offer',
        amount: 1200,
        message:
          'I can offer the product for ₹1200.',
      }
    }
  }


  // ------------------------------------------
  // FIND LAST OFFER
  // ------------------------------------------

  const lastAction =
    history[history.length - 1]

  const previousAmount =
    lastAction.amount


  // ==========================================
  // BUYER LOGIC
  // ==========================================

  if (isBuyer) {

    // Buyer receives vendor's ₹1200 counteroffer
    // and increases from ₹800 to ₹900.

    if (previousAmount === 1200) {

      return {
        type: 'counteroffer',
        amount: 900,
        message:
          'I can increase my offer to ₹900.',
      }
    }


    // Buyer responds to ₹1100
    // with ₹950.

    if (previousAmount === 1100) {

      return {
        type: 'counteroffer',
        amount: 950,
        message:
          'I can increase my offer to ₹950.',
      }
    }


    // Buyer responds to ₹1050
    // with final ₹1000.

    if (previousAmount === 1050) {

      return {
        type: 'offer',
        amount: 1000,
        message:
          'My final offer is ₹1000.',
      }
    }


    // Safety condition

    return {
      type: 'counteroffer',
      amount: 950,
      message:
        'I can offer ₹950 as my best possible price.',
    }
  }


  // ==========================================
  // VENDOR LOGIC
  // ==========================================

  if (isVendor) {

    // Buyer offers ₹800
    // Vendor counters with ₹1200.

    if (previousAmount === 800) {

      return {
        type: 'counteroffer',
        amount: 1200,
        message:
          'I cannot sell it for ₹800. My price is ₹1200.',
      }
    }


    // Buyer offers ₹900
    // Vendor reduces to ₹1100.

    if (previousAmount === 900) {

      return {
        type: 'counteroffer',
        amount: 1100,
        message:
          'I can reduce the price to ₹1100.',
      }
    }


    // Buyer offers ₹950
    // Vendor reduces to ₹1050.

    if (previousAmount === 950) {

      return {
        type: 'counteroffer',
        amount: 1050,
        message:
          'I can reduce the price to ₹1050.',
      }
    }


    // Buyer reaches ₹1000
    // Vendor accepts.

    if (previousAmount === 1000) {

      return {
        type: 'accept',
        amount: 1000,
        message:
          'I accept the offer of ₹1000.',
      }
    }
  }


  // ==========================================
  // FALLBACK
  // ==========================================

  return {
    type: 'reject',
    amount: null,
    message:
      'I cannot accept this proposal.',
  }
}


// ============================================
// ORCHESTRATOR
// ============================================

export function runNegotiationRound(
  state,
  agent1,
  agent2
) {

  // ------------------------------------------
  // FIND ACTIVE AGENT
  // ------------------------------------------

  const activeAgent =
    state.currentAgent === agent1.name
      ? agent1
      : agent2


  // ------------------------------------------
  // FIND OPPONENT
  // ------------------------------------------

  const opponentAgent =
    state.currentAgent === agent1.name
      ? agent2
      : agent1


  // ------------------------------------------
  // GET PREVIOUS OFFER
  // ------------------------------------------

  const opponentOffer =
    state.history.length > 0
      ? state.history[state.history.length - 1]
      : null


  // ------------------------------------------
  // CREATE STANDARD AGENT INPUT
  // ------------------------------------------

  const agentInput =
    createAgentInput(
      activeAgent,
      state,
      state.history,
      opponentOffer
    )


  // ------------------------------------------
  // GENERATE RESPONSE
  // ------------------------------------------

  const response =
    generateAgentResponse(
      activeAgent,
      state,
      state.history
    )


  // ------------------------------------------
  // CREATE HISTORY ENTRY
  // ------------------------------------------

  const historyEntry = {

    round: state.currentRound,

    agent: activeAgent.name,

    type: response.type,

    amount: response.amount,

    message: response.message,
  }


  // ------------------------------------------
  // UPDATE HISTORY
  // ------------------------------------------

  const updatedState = {

    ...state,

    history: [
      ...state.history,
      historyEntry,
    ],
  }


  // ------------------------------------------
  // STORE OFFERS
  // ------------------------------------------

  if (response.type === 'offer') {

    updatedState.offers = [
      ...state.offers,
      historyEntry,
    ]
  }


  // ------------------------------------------
  // STORE COUNTEROFFERS
  // ------------------------------------------

  if (response.type === 'counteroffer') {

    updatedState.counteroffers = [
      ...state.counteroffers,
      historyEntry,
    ]
  }


  // ------------------------------------------
  // STORE DECISIONS
  // ------------------------------------------

  if (
    response.type === 'accept' ||
    response.type === 'reject'
  ) {

    updatedState.decisions = [
      ...state.decisions,
      historyEntry,
    ]
  }


  // ------------------------------------------
  // AGREEMENT REACHED
  // ------------------------------------------

  if (response.type === 'accept') {

    updatedState.status = 'accepted'

    return {
      state: updatedState,
      input: agentInput,
    }
  }


  // ------------------------------------------
  // REJECTION
  // ------------------------------------------

  if (response.type === 'reject') {

    updatedState.status = 'terminated'

    return {
      state: updatedState,
      input: agentInput,
    }
  }


  // ------------------------------------------
  // MAXIMUM ROUND CHECK
  // ------------------------------------------

  if (state.currentRound >= 5) {

    updatedState.status = 'terminated'

    return {
      state: updatedState,
      input: agentInput,
    }
  }


  // ------------------------------------------
  // CHANGE TURN
  // ------------------------------------------

  updatedState.currentAgent =
    opponentAgent.name


  // ------------------------------------------
  // INCREASE ROUND
  //
  // A round is completed after Vendor finishes.
  // ------------------------------------------

  if (activeAgent.name === agent2.name) {

    updatedState.currentRound =
      state.currentRound + 1
  }


  // ------------------------------------------
  // RETURN UPDATED STATE
  // ------------------------------------------

  return {
    state: updatedState,
    input: agentInput,
  }
}