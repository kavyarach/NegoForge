import { NEGOTIATION_STATUS, DECISION_TYPE, NEGOTIATION_MODE, STANCE_TYPE } from '../constants/negotiationConstants';
import { createOffer } from '../models/Offer';
import { createNegotiationState } from '../models/NegotiationState';
import { createAgentInput } from '../models/AgentInput';
import { generate_agent_response } from './LLMIntegrationInterface';
import { trackAgentConcessions } from './ConcessionTracker';

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
    this.state.agentConcessions = {};
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
  processOffer({ agentId, value, terms, reason }) {
    if (this.state.negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) {
      throw new Error(`Cannot submit offer when negotiation status is ${this.state.negotiationStatus}`);
    }

    const offer = createOffer({
      value: Number(value),
      terms: terms || `Offer of ${this.state.scenario?.currencySymbol || '$'}${Number(value).toLocaleString()}`,
      agentId,
      roundNumber: this.state.currentRound,
      reason: reason || `Submitted offer of ${value}`,
    });

    const concession = trackAgentConcessions(this.state.negotiationHistory, agentId, offer.value);
    if (!this.state.agentConcessions) this.state.agentConcessions = {};
    this.state.agentConcessions[agentId] = concession.cumulativeConcession;

    this.state.previousOffer = this.state.currentOffer;
    this.state.currentOffer = offer;
    this.state.agentOffers[agentId] = offer;
    this.state.updatedAt = new Date().toISOString();

    const historyEntry = {
      round: this.state.currentRound,
      agent: agentId,
      action: 'OFFER',
      offer,
      decision: null,
      reason: offer.reason,
      concession,
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

      const concession = trackAgentConcessions(this.state.negotiationHistory, agentId, newOffer.value);
      if (!this.state.agentConcessions) this.state.agentConcessions = {};
      this.state.agentConcessions[agentId] = concession.cumulativeConcession;

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

    const currency = this.state.scenario?.currencySymbol || '$';
    const timestamp = new Date().toISOString();

    const mediatorOffer = createOffer({
      value: midpoint,
      terms: `Mediator Compromise at ${currency}${midpoint.toLocaleString()}`,
      agentId: 'Orchestrator Mediator',
      roundNumber: this.state.currentRound,
      reason: `Automated Mediator compromise proposed at midpoint (${currency}${midpoint.toLocaleString()}) between ${currency}${val1.toLocaleString()} and ${currency}${val2.toLocaleString()}. Both parties agree to settle.`,
    });

    this.state.currentOffer = mediatorOffer;
    this.state.negotiationStatus = NEGOTIATION_STATUS.AGREEMENT;
    this.state.deadlockDetected = false;
    this.state.updatedAt = timestamp;

    this.state.negotiationHistory.push({
      round: this.state.currentRound,
      agent: 'Orchestrator Mediator',
      action: DECISION_TYPE.ACCEPT,
      offer: mediatorOffer,
      decision: DECISION_TYPE.ACCEPT,
      reason: mediatorOffer.reason,
      concession: null,
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
   * Automated turn step executor using Reasoning Engine.
   */
  executeTurnStep() {
    if (this.state.negotiationStatus !== NEGOTIATION_STATUS.IN_PROGRESS) {
      return this.getCurrentState();
    }

    const currentAgent = this.state.currentAgentTurn;
    const scenario = this.state.scenario;

    // Opening offer if no offer exists yet
    if (!this.state.currentOffer) {
      const initialVal = scenario.initialOfferValue || 100000;
      const agentPersonality = this.state.agentPersonality[currentAgent] || 'Collaborative';
      return this.processOffer({
        agentId: currentAgent,
        value: initialVal,
        terms: `Initial opening proposal of ${scenario.currencySymbol || ''}${initialVal.toLocaleString()}`,
        reason: `Opening negotiation with baseline proposal based on ${agentPersonality.toLowerCase()} strategy.`,
      });
    }

    // Build standard Agent Input & generate response
    const agentInput = this.getAgentInputForCurrentTurn();
    const response = generate_agent_response(agentInput, this.state, this.state.negotiationHistory);

    return this.processDecision({
      agentId: currentAgent,
      decision: response.decision,
      reason: response.reason,
      counterOffer: response.counterOffer,
      stance: response.stance,
    });
  }
}
