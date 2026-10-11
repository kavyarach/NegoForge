import { NEGOTIATION_STATUS, DECISION_TYPE, NEGOTIATION_MODE, STANCE_TYPE } from '../constants/negotiationConstants.js';
import { createOffer } from '../models/Offer.js';
import { createNegotiationState } from '../models/NegotiationState.js';
import { createAgentInput } from '../models/AgentInput.js';
import { generate_agent_response } from './LLMIntegrationInterface.js';
import { calculateConcession } from './ConcessionTracker.js';
import { MultiAttributeUtilityService } from './MultiAttributeUtilityService.js';

export class NegotiationOrchestrator {
  constructor() {
    this.state = createNegotiationState({});
  }

  /**
   * Initializes and starts a new negotiation.
   *
   * @param {Object} scenario - Selected scenario object
   * @param {Object} agentConfigs - Map of agentName -> personality string
   * @param {string} mode - NEGOTIATION_MODE.SIMULATION or NEGOTIATION_MODE.PRACTICE
   * @param {string|null} humanAgentId - Agent ID played by human user if practice mode
   * @returns {Object} Current Negotiation State
   */
  startNegotiation(scenario, agentConfigs = {}, mode = NEGOTIATION_MODE.SIMULATION, humanAgentId = null) {
    this.state = createNegotiationState({ scenario, agentConfigs, mode, humanAgentId });
    this.state.negotiationStatus = NEGOTIATION_STATUS.IN_PROGRESS;
    this.state.updatedAt = new Date().toISOString();
    return this.getCurrentState();
  }

  /**
   * Returns a deep copy of the current negotiation state.
   */
  getCurrentState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Returns negotiation history log.
   */
  getNegotiationHistory() {
    return [...this.state.negotiationHistory];
  }

  /**
   * Submits and processes an offer from an agent or human.
   */
  processOffer({ agentId, value, terms, reason, structuredTerms = null }) {
    if (this.state.negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) {
      throw new Error(`Cannot submit offer when negotiation status is ${this.state.negotiationStatus}`);
    }

    const offer = createOffer({
      value: Number(value),
      terms: structuredTerms || terms || MultiAttributeUtilityService.buildInitialTerms(this.state.scenario, agentId),
      agentId,
      roundNumber: this.state.currentRound,
      reason: reason || `Submitted offer of ${value}`,
    });

    const previousVal = this.state.currentOffer ? this.state.currentOffer.value : null;
    const concession = calculateConcession(previousVal, offer.value);

    this.state.previousOffer = this.state.currentOffer;
    this.state.currentOffer = offer;
    this.state.agentOffers[agentId] = offer;
    this.state.updatedAt = new Date().toISOString();

    const utility = MultiAttributeUtilityService.scoreOffer(this.state.scenario, agentId, offer);

    const historyEntry = {
      round: this.state.currentRound,
      agent: agentId,
      action: 'OFFER',
      offer,
      decision: null,
      reason: offer.reason,
      concession,
      utility,
      stance: this.state.agentStances[agentId] || STANCE_TYPE.MODERATE,
      timestamp: offer.timestamp,
    };

    this.state.negotiationHistory.push(historyEntry);

    // Check Deadlock conditions
    this.checkDeadlock();

    // Switch turn to counterpart agent
    if (this.state.negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS) {
      this.switchTurn();
    }

    return this.getCurrentState();
  }

  /**
   * Processes a decision (ACCEPT, REJECT, COUNTEROFFER).
   */
  processDecision({ agentId, decision, reason, counterOffer = null, stance = null }) {
    if (this.state.negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) {
      throw new Error(`Cannot process decision when negotiation status is ${this.state.negotiationStatus}`);
    }

    const timestamp = new Date().toISOString();
    if (stance) {
      this.state.agentStances[agentId] = stance;
    }

    const decisionRecord = {
      round: this.state.currentRound,
      agent: agentId,
      decision,
      reason,
      timestamp,
    };
    this.state.decisions.push(decisionRecord);

    if (decision === DECISION_TYPE.ACCEPT) {
      this.state.negotiationStatus = NEGOTIATION_STATUS.AGREEMENT;
      this.state.updatedAt = timestamp;

      this.state.negotiationHistory.push({
        round: this.state.currentRound,
        agent: agentId,
        action: DECISION_TYPE.ACCEPT,
        offer: this.state.currentOffer,
        decision: DECISION_TYPE.ACCEPT,
        reason: reason || 'Accepted the current offer.',
        concession: null,
        utility: this.state.currentOffer
          ? MultiAttributeUtilityService.scoreOffer(this.state.scenario, agentId, this.state.currentOffer)
          : null,
        stance: STANCE_TYPE.FLEXIBLE,
        timestamp,
      });
    } else if (decision === DECISION_TYPE.REJECT) {
      this.state.negotiationStatus = NEGOTIATION_STATUS.REJECTED;
      this.state.updatedAt = timestamp;

      this.state.negotiationHistory.push({
        round: this.state.currentRound,
        agent: agentId,
        action: DECISION_TYPE.REJECT,
        offer: this.state.currentOffer,
        decision: DECISION_TYPE.REJECT,
        reason: reason || 'Rejected the current offer.',
        concession: null,
        stance: STANCE_TYPE.STUBBORN,
        timestamp,
      });
    } else if (decision === DECISION_TYPE.COUNTEROFFER) {
      const newOffer = counterOffer || createOffer({
        value: this.state.currentOffer ? this.state.currentOffer.value : 0,
        terms: 'Counter offer',
        agentId,
        roundNumber: this.state.currentRound,
        reason,
      });

      const previousVal = this.state.currentOffer ? this.state.currentOffer.value : null;
      const concession = calculateConcession(previousVal, newOffer.value);
      const utility = MultiAttributeUtilityService.scoreOffer(this.state.scenario, agentId, newOffer);

      this.state.previousOffer = this.state.currentOffer;
      this.state.currentOffer = newOffer;
      this.state.agentOffers[agentId] = newOffer;
      this.state.counterOffers.push(newOffer);
      this.state.updatedAt = timestamp;

      this.state.negotiationHistory.push({
        round: this.state.currentRound,
        agent: agentId,
        action: DECISION_TYPE.COUNTEROFFER,
        offer: newOffer,
        decision: DECISION_TYPE.COUNTEROFFER,
        reason: reason || newOffer.reason,
        concession,
        utility,
        stance: stance || STANCE_TYPE.MODERATE,
        timestamp,
      });

      // Check for deadlock
      this.checkDeadlock();

      if (this.state.negotiationStatus === NEGOTIATION_STATUS.IN_PROGRESS) {
        const agents = this.state.scenario?.agents || [];
        const firstAgentId = agents[0] ? (agents[0].id || agents[0].name) : null;

        if (agentId !== firstAgentId) {
          // Agent 2 counteroffered -> complete round
          this.startNextRound();
        } else {
          this.switchTurn();
        }
      }
    }

    return this.getCurrentState();
  }

  /**
   * Deadlock Detection Module
   * Checks if negotiation is stagnant or round limit reached.
   */
  checkDeadlock(maxRounds = 5) {
    if (this.state.negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) return;

    // Condition 1: Max round limit reached
    if (this.state.currentRound >= maxRounds && this.state.counterOffers.length >= maxRounds) {
      this.state.negotiationStatus = NEGOTIATION_STATUS.DEADLOCK;
      this.state.deadlockDetected = true;
      this.state.deadlockReason = `Maximum negotiation rounds (${maxRounds}) reached without agreement.`;
      this.state.updatedAt = new Date().toISOString();
      return;
    }

    // Condition 2: Stagnant Concessions - last 3 counteroffers had zero or negligible concessions (< 0.5%)
    const historyWithConcessions = this.state.negotiationHistory.filter((h) => h.concession && h.concession.previousValue !== null);
    if (historyWithConcessions.length >= 3) {
      const recent3 = historyWithConcessions.slice(-3);
      const allZeroConcession = recent3.every((h) => h.concession.concessionPercentage < 0.5);
      if (allZeroConcession) {
        this.state.negotiationStatus = NEGOTIATION_STATUS.DEADLOCK;
        this.state.deadlockDetected = true;
        this.state.deadlockReason = 'Negotiation deadlock detected due to 3 consecutive rounds of unyielding positions with zero concession.';
        this.state.updatedAt = new Date().toISOString();
      }
    }
  }

  /**
   * Deadlock Resolution Module
   * Resolves deadlock by proposing a mediator compromise midpoint offer.
   */
  resolveDeadlockWithCompromise() {
    if (this.state.negotiationStatus !== NEGOTIATION_STATUS.DEADLOCK) {
      throw new Error('Can only resolve deadlock when status is DEADLOCK');
    }

    const offers = Object.values(this.state.agentOffers);
    if (offers.length < 2) {
      this.state.negotiationStatus = NEGOTIATION_STATUS.REJECTED;
      return this.getCurrentState();
    }

    const val1 = offers[0].value;
    const val2 = offers[1].value;
    const midpoint = Math.round((val1 + val2) / 2);
    const mediatorTerms = {};
    (this.state.scenario?.multiTerms || []).forEach((definition) => {
      const values = offers
        .map((offer) => offer?.terms && typeof offer.terms === 'object' ? offer.terms[definition.name] : undefined)
        .filter((value) => value !== undefined && value !== null);
      if (!values.length) return;
      if (Array.isArray(definition.options)) {
        const indexes = values.map((value) => definition.options.indexOf(value)).filter((index) => index >= 0);
        mediatorTerms[definition.name] = definition.options[Math.round(indexes.reduce((sum, index) => sum + index, 0) / indexes.length)] || 0;
      } else {
        const numericValues = values.map(Number).filter(Number.isFinite);
        if (numericValues.length) mediatorTerms[definition.name] = Math.round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length);
      }
    });

    const currency = this.state.scenario?.currencySymbol || '$';
    const timestamp = new Date().toISOString();

    const mediatorOffer = createOffer({
      value: midpoint,
      terms: Object.keys(mediatorTerms).length ? mediatorTerms : `Mediator Compromise at ${currency}${midpoint.toLocaleString()}`,
      agentId: 'Orchestrator Mediator',
      roundNumber: this.state.currentRound,
      reason: `Automated Mediator compromise proposed at midpoint (${currency}${midpoint.toLocaleString()}) between ${currency}${val1.toLocaleString()} and ${currency}${val2.toLocaleString()}. Both parties agree to settle.`,
    });

    this.state.currentOffer = mediatorOffer;
    this.state.negotiationStatus = NEGOTIATION_STATUS.IN_PROGRESS;
    this.state.deadlockDetected = true;
    this.state.deadlockReason = `Automated Mediator proposed a compromise package (${currency}${midpoint.toLocaleString()}). Explicit acceptance required from participants to finalize agreement.`;
    this.state.updatedAt = timestamp;

    this.state.negotiationHistory.push({
      round: this.state.currentRound,
      agent: 'Orchestrator Mediator',
      action: 'MEDIATION_PROPOSAL',
      offer: mediatorOffer,
      decision: 'MEDIATION_PROPOSAL',
      reason: mediatorOffer.reason,
      concession: null,
      utility: Object.fromEntries(
        offers.map((offer) => [
          offer.agentId,
          MultiAttributeUtilityService.scoreOffer(this.state.scenario, offer.agentId, mediatorOffer),
        ])
      ),
      stance: STANCE_TYPE.FLEXIBLE,
      timestamp,
    });

    return this.getCurrentState();
  }

  /**
   * Switches active turn to counterpart agent.
   */
  switchTurn() {
    this.state.currentAgentTurn = this.getNextAgent();
    return this.state.currentAgentTurn;
  }

  /**
   * Starts next round.
   */
  startNextRound(maxRounds = 5) {
    if (this.state.currentRound >= maxRounds) {
      this.state.negotiationStatus = NEGOTIATION_STATUS.DEADLOCK;
      this.state.deadlockDetected = true;
      this.state.deadlockReason = `Maximum negotiation limit (${maxRounds} rounds) reached.`;
      this.state.updatedAt = new Date().toISOString();
      return this.getCurrentState();
    }

    this.state.currentRound += 1;
    const agents = this.state.scenario?.agents || [];
    const firstAgent = agents[0] ? (agents[0].id || agents[0].name) : null;
    this.state.currentAgentTurn = firstAgent;
    this.state.updatedAt = new Date().toISOString();
    return this.getCurrentState();
  }

  /**
   * Gets ID of next turn agent.
   */
  getNextAgent() {
    const agents = this.state.scenario ? this.state.scenario.agents || [] : [];
    if (agents.length < 2) return this.state.currentAgentTurn;

    const currentKey = this.state.currentAgentTurn;
    const agentKeys = agents.map((a) => a.id || a.name);
    const currentIndex = agentKeys.indexOf(currentKey);

    const nextIndex = (currentIndex + 1) % agentKeys.length;
    return agentKeys[nextIndex];
  }

  /**
   * Standard Agent Input for current active turn.
   */
  getAgentInputForCurrentTurn() {
    const currentAgent = this.state.currentAgentTurn;
    return createAgentInput({
      agentId: currentAgent,
      scenario: this.state.scenario,
      agentGoals: this.state.agentGoals,
      agentConstraints: this.state.agentConstraints,
      agentPersonality: this.state.agentPersonality,
      negotiationState: this.state,
      history: this.state.negotiationHistory,
      opponentOffer: this.state.currentOffer,
    });
  }

  /**
   * Applies a one-turn AI Coach strategy override to the current AI agent.
   */
  applyStrategyOverride({ agentId, strategy }) {
    if (this.state.negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) {
      throw new Error('Cannot apply a strategy when the negotiation is not in progress.');
    }
    const normalizedStrategy = String(strategy || '').toUpperCase();
    if (!['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'].includes(normalizedStrategy)) {
      throw new Error('Strategy must be CONSERVATIVE, BALANCED, or AGGRESSIVE.');
    }
    if (agentId !== this.state.currentAgentTurn) {
      throw new Error('Strategy override can only target the current agent turn.');
    }
    if (this.state.mode === NEGOTIATION_MODE.PRACTICE && agentId === this.state.humanAgentId) {
      throw new Error('AI strategy overrides cannot target the human participant.');
    }

    this.state.currentStrategyOverride = {
      agentId,
      strategy: normalizedStrategy,
      appliedAt: new Date().toISOString(),
    };
    this.state.updatedAt = new Date().toISOString();
    return this.getCurrentState();
  }

  /**
   * Automated turn step executor using Reasoning Engine.
   */
  executeTurnStep() {
    if (this.state.negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) {
      return this.getCurrentState();
    }

    const currentAgent = this.state.currentAgentTurn;
    const scenario = this.state.scenario;
    const activeOverride = this.state.currentStrategyOverride?.agentId === currentAgent
      ? this.state.currentStrategyOverride
      : null;

    // Opening offer uses the same multi-attribute preference engine as later turns.
    if (!this.state.currentOffer) {
      const agent = scenario?.agents?.find((item) => (item.id || item.name) === currentAgent);
      const agentPersonality = this.state.agentPersonality[currentAgent] || 'Collaborative';
      const meta = MultiAttributeUtilityService.getAgentProfile(scenario, currentAgent);
      const pricePreference = agent?.preferences?.price;
      const baseValue = Number(pricePreference?.ideal ?? agent?.baselineTarget ?? scenario.initialOfferValue ?? 100000);
      let openingValue = baseValue;
      if (activeOverride?.strategy === 'AGGRESSIVE') {
        openingValue = agent?.preferredDirection === 'DECREASE' ? Math.round(baseValue * 0.98) : Math.round(baseValue * 1.02);
      } else if (activeOverride?.strategy === 'CONSERVATIVE') {
        openingValue = agent?.preferredDirection === 'DECREASE' ? Math.round(baseValue * 1.03) : Math.round(baseValue * 0.97);
      }
      const openingTerms = MultiAttributeUtilityService.buildInitialTerms(scenario, currentAgent);
      const strategyText = activeOverride ? ` The ${activeOverride.strategy.toLowerCase()} AI Coach strategy was applied for this turn.` : '';
      this.state.currentStrategyOverride = null;
      return this.processOffer({
        agentId: currentAgent,
        value: openingValue,
        structuredTerms: openingTerms,
        reason: `Opening negotiation with ${agentPersonality.toLowerCase()} preferences across price and secondary terms.${strategyText}`,
      });
    }

    // Build standard Agent Input & generate response
    const agentInput = this.getAgentInputForCurrentTurn();
    const response = generate_agent_response(agentInput, this.state, this.state.negotiationHistory);
    const decisionReason = activeOverride
      ? `${response.reason} [AI Coach: ${activeOverride.strategy.toLowerCase()} strategy applied for this turn.]`
      : response.reason;
    if (activeOverride) {
      this.state.currentStrategyOverride = null;
    }

    return this.processDecision({
      agentId: currentAgent,
      decision: response.decision,
      reason: decisionReason,
      counterOffer: response.counterOffer,
      stance: response.stance,
    });
  }
}
