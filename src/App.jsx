import { useState } from 'react';
import './App.css';
import { scenarios, personalityOptions } from './constants/scenarios';
import { NEGOTIATION_MODE } from './constants/negotiationConstants';
import { NegotiationApi } from './services/NegotiationApi';
import { NegotiationArenaPanel } from './components/NegotiationArenaPanel';

function App() {
  const [selectedMode, setSelectedMode] = useState(NEGOTIATION_MODE.SIMULATION);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [agentPersonalities, setAgentPersonalities] = useState({});
  const [humanRole, setHumanRole] = useState(null);
  const [ready, setReady] = useState(false);
  const [negotiationState, setNegotiationState] = useState(null);

  const scenario = selectedScenario ? scenarios[selectedScenario] : null;

  const handleScenarioSelect = (scenarioId) => {
    setSelectedScenario(scenarioId);
    setAgentPersonalities({});
    setHumanRole(null);
    setReady(false);
    setNegotiationState(null);
  };

  const handleModeChange = (mode) => {
    setSelectedMode(mode);
    setReady(false);
    setNegotiationState(null);
  };

  const handlePersonalityChange = (agentName, personality) => {
    setAgentPersonalities((previous) => ({
      ...previous,
      [agentName]: personality,
    }));
    setReady(false);
    setNegotiationState(null);
  };

  const allPersonalitiesSelected =
    scenario &&
    scenario.agents.every(
      (agent) => agentPersonalities[agent.name] || agentPersonalities[agent.id]
    );

  const isSetupComplete =
    allPersonalitiesSelected &&
    (selectedMode === NEGOTIATION_MODE.SIMULATION || (selectedMode === NEGOTIATION_MODE.PRACTICE && humanRole));

  // Start Negotiation
  const handleStart = () => {
    if (isSetupComplete && scenario) {
      try {
        const state = NegotiationApi.createNegotiation(
          scenario,
          agentPersonalities,
          selectedMode,
          humanRole
        );
        setNegotiationState(state);
        setReady(true);
      } catch (err) {
        console.error('Failed to create negotiation:', err);
      }
    }
  };

  const handleReset = () => {
    setReady(false);
    setNegotiationState(null);
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div>
          <p className="eyebrow">AI DRIVEN MULTI-AGENT SIMULATOR</p>
          <h1>NegoForge Platform</h1>
          <p className="subtitle">
            Train, simulate, and practice multi-agent business negotiations powered by Generative AI personas.
          </p>
        </div>
      </header>

      <main>
        {/* STEP 1 - MODE SELECTION */}
        <section className="section">
          <div className="section-heading">
            <span className="step">01</span>
            <div>
              <h2>Select Operating Mode</h2>
              <p>Choose whether to observe AI agents or participate directly as a negotiating stakeholder.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <button
              className={`mode-card ${selectedMode === NEGOTIATION_MODE.SIMULATION ? 'selected' : ''}`}
              onClick={() => handleModeChange(NEGOTIATION_MODE.SIMULATION)}
              style={{
                background: selectedMode === NEGOTIATION_MODE.SIMULATION ? 'rgba(2, 132, 199, 0.15)' : 'rgba(30, 41, 59, 0.6)',
                border: `2px solid ${selectedMode === NEGOTIATION_MODE.SIMULATION ? '#0284c7' : '#334155'}`,
                borderRadius: '16px', padding: '24px', textAlign: 'left', cursor: 'pointer', color: '#fff',
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🤖</div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem' }}>Simulation Mode (AI vs AI)</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', lineHeight: '1.5' }}>
                Observe autonomous AI agents negotiate with unique personas, target goals, reservation limits, and negotiation strategies.
              </p>
            </button>

            <button
              className={`mode-card ${selectedMode === NEGOTIATION_MODE.PRACTICE ? 'selected' : ''}`}
              onClick={() => handleModeChange(NEGOTIATION_MODE.PRACTICE)}
              style={{
                background: selectedMode === NEGOTIATION_MODE.PRACTICE ? 'rgba(139, 92, 246, 0.15)' : 'rgba(30, 41, 59, 0.6)',
                border: `2px solid ${selectedMode === NEGOTIATION_MODE.PRACTICE ? '#8b5cf6' : '#334155'}`,
                borderRadius: '16px', padding: '24px', textAlign: 'left', cursor: 'pointer', color: '#fff',
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>👤</div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem' }}>Practice Mode (Human vs AI)</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', lineHeight: '1.5' }}>
                Participate directly as one of the negotiating parties against intelligent AI agent counterparts to sharpen your negotiation skills.
              </p>
            </button>
          </div>
        </section>

        {/* STEP 2 - SCENARIO SELECTION */}
        <section className="section">
          <div className="section-heading">
            <span className="step">02</span>
            <div>
              <h2>Select a Scenario Template</h2>
              <p>Choose from three pre-built industry negotiation scenario templates.</p>
            </div>
          </div>

          <div className="scenario-grid">
            {Object.entries(scenarios).map(([id, item]) => (
              <button
                key={id}
                className={`scenario-card ${selectedScenario === id ? 'selected' : ''}`}
                onClick={() => handleScenarioSelect(id)}
              >
                <div className="scenario-icon">
                  {id === 'vendor' ? '🛒' : id === 'job' ? '💼' : '📊'}
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span className="select-text">
                  {selectedScenario === id ? '✓ Selected' : 'Select Scenario →'}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* STEP 3 - AGENT CONFIGURATION & HUMAN ROLE SELECTION */}
        {scenario && (
          <section className="section">
            <div className="section-heading">
              <span className="step">03</span>
              <div>
                <h2>Agent Persona & Role Configuration</h2>
                <p>Configure persona traits and goals for <strong>{scenario.title}</strong>.</p>
              </div>
            </div>

            {/* If Practice Mode: Human Role Picker */}
            {selectedMode === NEGOTIATION_MODE.PRACTICE && (
              <div style={{
                background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: '12px', padding: '20px', marginBottom: '24px'
              }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#a78bfa' }}>
                  👤 Select Your Persona Role in Practice Mode
                </h4>
                <div style={{ display: 'flex', gap: '16px' }}>
                  {scenario.agents.map((ag) => {
                    const agId = ag.id || ag.name;
                    const isSelected = humanRole === agId;
                    return (
                      <button
                        key={agId}
                        type="button"
                        onClick={() => setHumanRole(agId)}
                        style={{
                          flex: 1, padding: '14px 20px', borderRadius: '10px',
                          background: isSelected ? '#7c3aed' : '#1e293b',
                          border: `2px solid ${isSelected ? '#a78bfa' : '#334155'}`,
                          color: '#fff', fontWeight: 600, cursor: 'pointer', textAlign: 'left'
                        }}
                      >
                        <div style={{ fontSize: '1.1rem' }}>{ag.name}</div>
                        <div style={{ fontSize: '0.75rem', color: isSelected ? '#ede9fe' : '#94a3b8', fontWeight: 400 }}>
                          Role: {ag.role} | Goal: {ag.goal}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="agent-grid">
              {scenario.agents.map((agent, index) => {
                const agentId = agent.id || agent.name;
                const isHumanControlled = selectedMode === NEGOTIATION_MODE.PRACTICE && humanRole === agentId;

                return (
                  <div className="agent-card" key={agent.name} style={{
                    borderColor: isHumanControlled ? '#8b5cf6' : undefined
                  }}>
                    <div className="agent-header">
                      <div className="agent-number">0{index + 1}</div>
                      <div>
                        <h3>
                          {agent.name} {isHumanControlled ? '👤 (YOU)' : '🤖 (AI)'}
                        </h3>
                        <span>{agent.role}</span>
                      </div>
                    </div>

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

                    <div className="personality">
                      <label htmlFor={`personality-${index}`}>PERSONALITY STRATEGY</label>
                      <select
                        id={`personality-${index}`}
                        value={agentPersonalities[agent.name] || ''}
                        onChange={(event) =>
                          handlePersonalityChange(agent.name, event.target.value)
                        }
                      >
                        <option value="" disabled>Select personality</option>
                        {personalityOptions.map((personality) => (
                          <option key={personality} value={personality}>
                            {personality}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* STEP 4 - READY TO START */}
        {scenario && !ready && (
          <section className="ready-section">
            <div>
              <span className="step">04</span>
              <h2>Ready to Start Negotiation?</h2>
              <p>
                {selectedMode === NEGOTIATION_MODE.PRACTICE && !humanRole
                  ? 'Select your participant role to complete setup.'
                  : 'All agent personalities configured. Launch into the Negotiation Arena.'}
              </p>
            </div>

            <button
              className="start-button"
              onClick={handleStart}
              disabled={!isSetupComplete}
            >
              {isSetupComplete ? 'Launch Negotiation Arena →' : 'Complete Setup Above'}
            </button>
          </section>
        )}

        {/* SUCCESS CARD & LIVE ARENA */}
        {ready && negotiationState && (
          <>
            <section className="success-card">
              <div className="success-icon">✓</div>
              <div>
                <p className="success-label">
                  SESSION INITIALIZED • {selectedMode === NEGOTIATION_MODE.PRACTICE ? 'PRACTICE MODE' : 'SIMULATION MODE'}
                </p>
                <h2>Negotiation Arena Active</h2>
                <p>
                  State initialized with configured goals, constraints, personalities, and turn management.
                </p>
              </div>

              <div className="selected-agents">
                {scenario.agents.map((agent) => (
                  <div key={agent.name}>
                    <strong>{agent.name} {selectedMode === NEGOTIATION_MODE.PRACTICE && humanRole === (agent.id || agent.name) ? '(YOU)' : ''}</strong>
                    <span>{agentPersonalities[agent.name]}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="section engine-section" style={{ marginTop: '30px' }}>
              <NegotiationArenaPanel
                state={negotiationState}
                onStateChange={setNegotiationState}
                onReset={handleReset}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;