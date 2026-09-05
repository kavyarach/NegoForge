import { useState } from 'react'
import './App.css'

import {
  createNegotiationState,
  runNegotiationRound,
} from './orchestrator'

const scenarios = {
  vendor: {
    title: 'Vendor Pricing Negotiation',
    description:
      'Negotiate the price of a product between a buyer and vendor.',
    icon: '🛒',
    agents: [
      {
        name: 'Buyer',
        role: 'Customer',
        icon: '🛍️',
        goal: 'Get the best possible price',
        constraint: 'Limited budget',
      },
      {
        name: 'Vendor',
        role: 'Shopkeeper',
        icon: '🏪',
        goal: 'Maximize profit',
        constraint: 'Minimum acceptable price',
      },
    ],
  },

  job: {
    title: 'Job Offer Negotiation',
    description:
      'Negotiate salary and job terms between a candidate and HR.',
    icon: '💼',
    agents: [
      {
        name: 'Candidate',
        role: 'Job Applicant',
        icon: '👩‍💻',
        goal: 'Get the best possible offer',
        constraint: 'Minimum acceptable salary',
      },
      {
        name: 'HR',
        role: 'Recruiter',
        icon: '🧑‍💼',
        goal: 'Hire the candidate within budget',
        constraint: 'Maximum salary budget',
      },
    ],
  },

  budget: {
    title: 'Project Budget Allocation',
    description:
      'Negotiate how a limited project budget should be allocated.',
    icon: '📊',
    agents: [
      {
        name: 'Project Manager',
        role: 'Project Manager',
        icon: '📋',
        goal: 'Allocate the budget effectively',
        constraint: 'Fixed project budget',
      },
      {
        name: 'Team Lead',
        role: 'Team Representative',
        icon: '👥',
        goal: 'Secure enough budget for the team',
        constraint: 'Limited overall budget',
      },
    ],
  },
}

const personalityOptions = [
  'Aggressive',
  'Collaborative',
  'Risk-Averse',
]

function App() {
  const [selectedScenario, setSelectedScenario] = useState(null)
  const [agentPersonalities, setAgentPersonalities] = useState({})
  const [ready, setReady] = useState(false)

  // Sprint 2 - Negotiation State
  const [negotiationState, setNegotiationState] = useState(null)

  const scenario = selectedScenario
    ? scenarios[selectedScenario]
    : null

  const handleScenarioSelect = (scenarioId) => {
    setSelectedScenario(scenarioId)
    setAgentPersonalities({})
    setReady(false)
    setNegotiationState(null)
  }

  const handlePersonalityChange = (agentName, personality) => {
    setAgentPersonalities((previous) => ({
      ...previous,
      [agentName]: personality,
    }))

    setReady(false)
    setNegotiationState(null)
  }

  const allPersonalitiesSelected =
    scenario &&
    scenario.agents.every(
      (agent) => agentPersonalities[agent.name]
    )

  // Start Negotiation
  const handleStart = () => {
    if (allPersonalitiesSelected) {
      const configuredAgents = scenario.agents.map(
        (agent) => ({
          ...agent,
          personality:
            agentPersonalities[agent.name],
        })
      )

      const initialState =
        createNegotiationState(
          configuredAgents[0],
          configuredAgents[1]
        )

      setNegotiationState({
        ...initialState,
        agentsData: configuredAgents,
      })

      setReady(true)
    }
  }

  // Run next turn
  const handleNextTurn = () => {
    if (!negotiationState) {
      return
    }

    const result = runNegotiationRound(
      negotiationState,
      negotiationState.agentsData[0],
      negotiationState.agentsData[1]
    )

    setNegotiationState({
      ...result.state,
      agentsData:
        negotiationState.agentsData,
    })
  }

  return (
    <div className="app">

      {/* HEADER */}

      <header className="header">

        <p className="eyebrow">
          AI NEGOTIATION PLATFORM
        </p>

        <h1>
          Negotiation Simulator 🤝
        </h1>

        <p className="subtitle">
          Configure your scenario and agents to begin.
        </p>

      </header>


      <main>

        {/* STEP 1 - SCENARIO SELECTION */}

        <section className="section">

          <div className="section-heading">

            <span className="step">
              01
            </span>

            <div>

              <h2>
                Select a Scenario
              </h2>

              <p>
                Choose the type of negotiation you want
                to configure.
              </p>

            </div>

          </div>


          <div className="scenario-grid">

            {Object.entries(scenarios).map(
              ([id, item]) => (

                <button
                  key={id}
                  className={`scenario-card ${
                    selectedScenario === id
                      ? 'selected'
                      : ''
                  }`}
                  onClick={() =>
                    handleScenarioSelect(id)
                  }
                >

                  <div className="scenario-icon">
                    {item.icon}
                  </div>

                  <h3>
                    {item.title}
                  </h3>

                  <p>
                    {item.description}
                  </p>

                  <span className="select-text">

                    {selectedScenario === id
                      ? '✓ Selected'
                      : 'Select Scenario →'}

                  </span>

                </button>

              )
            )}

          </div>

        </section>


        {/* STEP 2 - AGENT CONFIGURATION */}

        {scenario && (

          <section className="section">

            <div className="section-heading">

              <span className="step">
                02
              </span>

              <div>

                <h2>
                  Agent Configuration
                </h2>

                <p>
                  Configure the agents involved in{' '}
                  <strong>
                    {scenario.title}
                  </strong>.
                </p>

              </div>

            </div>


            <div className="agent-grid">

              {scenario.agents.map(
                (agent, index) => (

                  <div
                    className="agent-card"
                    key={agent.name}
                  >

                    <div className="agent-header">

                      <div className="agent-number">
                        {agent.icon}
                      </div>

                      <div>

                        <h3>
                          {agent.name}
                        </h3>

                        <span>
                          {agent.role}
                        </span>

                      </div>

                    </div>


                    <div className="agent-info">

                      <div className="info-item">

                        <label>
                          🎯 Goal
                        </label>

                        <p>
                          {agent.goal}
                        </p>

                      </div>


                      <div className="info-item">

                        <label>
                          🔒 Constraint
                        </label>

                        <p>
                          {agent.constraint}
                        </p>

                      </div>

                    </div>


                    <div className="personality">

                      <label
                        htmlFor={`personality-${index}`}
                      >
                        🧠 Personality
                      </label>

                      <select
                        id={`personality-${index}`}
                        value={
                          agentPersonalities[
                            agent.name
                          ] || ''
                        }
                        onChange={(event) =>
                          handlePersonalityChange(
                            agent.name,
                            event.target.value
                          )
                        }
                      >

                        <option
                          value=""
                          disabled
                        >
                          Select personality
                        </option>

                        {personalityOptions.map(
                          (personality) => (

                            <option
                              key={personality}
                              value={personality}
                            >
                              {personality}
                            </option>

                          )
                        )}

                      </select>

                    </div>

                  </div>

                )
              )}

            </div>

          </section>

        )}


        {/* STEP 3 - READY */}

        {scenario && (

          <section className="ready-section">

            <div>

              <span className="step">
                03
              </span>

              <h2>
                Ready to Start? 🚀
              </h2>

              <p>
                Select a personality for both agents
                to complete the configuration.
              </p>

            </div>


            <button
              className="start-button"
              onClick={handleStart}
              disabled={!allPersonalitiesSelected}
            >

              {allPersonalitiesSelected
                ? 'Start Negotiation →'
                : 'Complete Configuration'}

            </button>

          </section>

        )}


        {/* CONFIGURATION COMPLETE */}

        {ready && (

          <section className="success-card">

            <div className="success-icon">
              ✓
            </div>


            <div>

              <p className="success-label">
                CONFIGURATION COMPLETE
              </p>

              <h2>
                Ready for Negotiation 🎉
              </h2>

              <p>
                The agents are configured and ready
                for the negotiation engine.
              </p>

            </div>


            <div className="selected-agents">

              {scenario.agents.map(
                (agent) => (

                  <div key={agent.name}>

                    <strong>
                      {agent.icon} {agent.name}
                    </strong>

                    <span>
                      {agentPersonalities[
                        agent.name
                      ]}
                    </span>

                  </div>

                )
              )}

            </div>


            {/* SPRINT 2 - NEGOTIATION CONTROLS */}

            {negotiationState && (

              <div className="negotiation-status">

                <h2>
                  Negotiation in Progress 🤝
                </h2>

                <p>
                  <strong>
                    Round:
                  </strong>{' '}
                  {negotiationState.currentRound}
                </p>

                <p>
                  <strong>
                    Current Turn:
                  </strong>{' '}
                  {negotiationState.currentAgent}
                </p>

                <p>
                  <strong>
                    Status:
                  </strong>{' '}
                  {negotiationState.status}
                </p>


                {negotiationState.status ===
                  'ongoing' && (

                  <button
                    className="start-button"
                    onClick={handleNextTurn}
                  >
                    Run Next Turn →
                  </button>

                )}


                {negotiationState.status ===
                  'accepted' && (

                  <h3>
                    🎉 Agreement Reached!
                  </h3>

                )}


                {negotiationState.status ===
                  'terminated' && (

                  <h3>
                    Negotiation Terminated
                  </h3>

                )}


                {/* CONVERSATION HISTORY */}

                <div className="conversation-history">

                  <h3>
                    Conversation History
                  </h3>

                  {negotiationState.history.length ===
                    0 && (

                    <p>
                      No negotiation activity yet.
                    </p>

                  )}

                  {negotiationState.history.map(
                    (item, index) => (

                      <div
                        className="history-item"
                        key={index}
                      >

                        <strong>
                          Round {item.round} —{' '}
                          {item.agent}
                        </strong>

                        <p>
                          <strong>
                            {item.type.toUpperCase()}
                          </strong>
                          {': '}
                          {item.message}
                        </p>

                      </div>

                    )
                  )}

                </div>


                {/* OFFERS */}

                <div className="negotiation-summary">

                  <h3>
                    Offers
                  </h3>

                  <p>
                    Total Offers:{' '}
                    {negotiationState.offers.length}
                  </p>

                  <p>
                    Total Counteroffers:{' '}
                    {negotiationState.counteroffers.length}
                  </p>

                  <p>
                    Decisions:{' '}
                    {negotiationState.decisions.length}
                  </p>

                </div>

              </div>

            )}

          </section>

        )}

      </main>

    </div>
  )
}

export default App