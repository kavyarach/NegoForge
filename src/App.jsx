import { useState } from 'react'
import './App.css'

const scenarios = {
  vendor: {
    title: 'Vendor Pricing Negotiation',
    description: 'Negotiate the price of a product between a buyer and vendor.',
    agents: [
      {
        name: 'Buyer',
        role: 'Customer',
        goal: 'Get the best possible price',
        constraint: 'Limited budget',
      },
      {
        name: 'Vendor',
        role: 'Shopkeeper',
        goal: 'Maximize profit',
        constraint: 'Minimum acceptable price',
      },
    ],
  },

  job: {
    title: 'Job Offer Negotiation',
    description: 'Negotiate salary and job terms between a candidate and HR.',
    agents: [
      {
        name: 'Candidate',
        role: 'Job Applicant',
        goal: 'Get the best possible offer',
        constraint: 'Minimum acceptable salary',
      },
      {
        name: 'HR',
        role: 'Recruiter',
        goal: 'Hire the candidate within budget',
        constraint: 'Maximum salary budget',
      },
    ],
  },

  budget: {
    title: 'Project Budget Allocation',
    description: 'Negotiate how a limited project budget should be allocated.',
    agents: [
      {
        name: 'Project Manager',
        role: 'Project Manager',
        goal: 'Allocate the budget effectively',
        constraint: 'Fixed project budget',
      },
      {
        name: 'Team Lead',
        role: 'Team Representative',
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

  const scenario = selectedScenario
    ? scenarios[selectedScenario]
    : null

  const handleScenarioSelect = (scenarioId) => {
    setSelectedScenario(scenarioId)
    setAgentPersonalities({})
    setReady(false)
  }

  const handlePersonalityChange = (agentName, personality) => {
    setAgentPersonalities((previous) => ({
      ...previous,
      [agentName]: personality,
    }))

    setReady(false)
  }

  const allPersonalitiesSelected =
    scenario &&
    scenario.agents.every(
      (agent) => agentPersonalities[agent.name]
    )

  const handleStart = () => {
    if (allPersonalitiesSelected) {
      setReady(true)
    }
  }

  return (
    <div className="app">

      {/* Header */}
      <header className="header">
        <div>
          <p className="eyebrow">AI NEGOTIATION PLATFORM</p>

          <h1>Negotiation Arena</h1>

          <p className="subtitle">
            Configure your negotiation scenario and prepare your agents.
          </p>
        </div>
      </header>

      <main>

        {/* STEP 1 - SCENARIO SELECTION */}
        <section className="section">

          <div className="section-heading">
            <span className="step">01</span>

            <div>
              <h2>Select a Scenario</h2>

              <p>
                Choose the type of negotiation you want to configure.
              </p>
            </div>
          </div>

          <div className="scenario-grid">

            {Object.entries(scenarios).map(([id, item]) => (

              <button
                key={id}
                className={`scenario-card ${
                  selectedScenario === id ? 'selected' : ''
                }`}
                onClick={() => handleScenarioSelect(id)}
              >

                <div className="scenario-icon">
                  {id === 'vendor'
                    ? '🛒'
                    : id === 'job'
                    ? '💼'
                    : '📊'}
                </div>

                <h3>{item.title}</h3>

                <p>{item.description}</p>

                <span className="select-text">
                  {selectedScenario === id
                    ? '✓ Selected'
                    : 'Select Scenario →'}
                </span>

              </button>

            ))}

          </div>
        </section>


        {/* STEP 2 - AGENT CONFIGURATION */}
        {scenario && (

          <section className="section">

            <div className="section-heading">

              <span className="step">02</span>

              <div>
                <h2>Agent Configuration</h2>

                <p>
                  Configure the agents involved in{' '}
                  <strong>{scenario.title}</strong>.
                </p>
              </div>

            </div>


            <div className="agent-grid">

              {scenario.agents.map((agent, index) => (

                <div
                  className="agent-card"
                  key={agent.name}
                >

                  {/* Agent Header */}
                  <div className="agent-header">

                    <div className="agent-number">
                      0{index + 1}
                    </div>

                    <div>
                      <h3>{agent.name}</h3>

                      <span>{agent.role}</span>
                    </div>

                  </div>


                  {/* Goal & Constraint */}
                  <div className="agent-info">

                    <div className="info-item">

                      <label>GOAL</label>

                      <p>{agent.goal}</p>

                    </div>


                    <div className="info-item">

                      <label>CONSTRAINT</label>

                      <p>{agent.constraint}</p>

                    </div>

                  </div>


                  {/* Personality */}
                  <div className="personality">

                    <label htmlFor={`personality-${index}`}>
                      PERSONALITY
                    </label>

                    <select
                      id={`personality-${index}`}
                      value={
                        agentPersonalities[agent.name] || ''
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

              ))}

            </div>

          </section>

        )}


        {/* STEP 3 - READY TO START */}
        {scenario && (

          <section className="ready-section">

            <div>

              <span className="step">03</span>

              <h2>Ready to Start?</h2>

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


        {/* SUCCESS / READY MESSAGE */}
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
                Ready for Negotiation
              </h2>

              <p>
                The agents are configured and ready
                for the negotiation engine.
              </p>

            </div>


            <div className="selected-agents">

              {scenario.agents.map((agent) => (

                <div key={agent.name}>

                  <strong>{agent.name}</strong>

                  <span>
                    {agentPersonalities[agent.name]}
                  </span>

                </div>

              ))}

            </div>

          </section>

        )}

      </main>

    </div>
  )
}

export default App