import { useMemo, useState } from 'react';
import './App.css';
import { scenarios, personalityOptions } from './constants/scenarios';
import { NEGOTIATION_MODE } from './constants/negotiationConstants';
import { NegotiationApi } from './services/NegotiationApi';
import { NegotiationArenaPanel } from './components/NegotiationArenaPanel';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'setup', label: 'Negotiation Lab', icon: '◈' },
  { id: 'arena', label: 'Live Arena', icon: '◉' },
  { id: 'insights', label: 'AI Insights', icon: '✦' },
];

function App() {
  const [selectedMode, setSelectedMode] = useState(NEGOTIATION_MODE.SIMULATION);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [agentPersonalities, setAgentPersonalities] = useState({});
  const [humanRole, setHumanRole] = useState(null);
  const [ready, setReady] = useState(false);
  const [negotiationState, setNegotiationState] = useState(null);
  const [activeNav, setActiveNav] = useState('dashboard');

  const scenario = selectedScenario ? scenarios[selectedScenario] : null;

  const handleScenarioSelect = (scenarioId) => {
    setSelectedScenario(scenarioId);
    setAgentPersonalities({});
    setHumanRole(null);
    setReady(false);
    setNegotiationState(null);
    setActiveNav('setup');
  };

  const handleModeChange = (mode) => {
    setSelectedMode(mode);
    setReady(false);
    setNegotiationState(null);
  };

  const handlePersonalityChange = (agentName, personality) => {
    setAgentPersonalities((previous) => ({ ...previous, [agentName]: personality }));
    setReady(false);
    setNegotiationState(null);
  };

  const allPersonalitiesSelected = scenario && scenario.agents.every(
    (agent) => agentPersonalities[agent.name] || agentPersonalities[agent.id]
  );

  const isSetupComplete = allPersonalitiesSelected && (
    selectedMode === NEGOTIATION_MODE.SIMULATION ||
    (selectedMode === NEGOTIATION_MODE.PRACTICE && humanRole)
  );

  const handleStart = () => {
    if (!isSetupComplete || !scenario) return;
    try {
      const state = NegotiationApi.createNegotiation(
        scenario,
        agentPersonalities,
        selectedMode,
        humanRole
      );
      setNegotiationState(state);
      setReady(true);
      setActiveNav('arena');
    } catch (err) {
      console.error('Failed to create negotiation:', err);
    }
  };

  const handleReset = () => {
    setReady(false);
    setNegotiationState(null);
    setActiveNav('setup');
  };

  const scrollTo = (id) => {
    setActiveNav(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const arenaMetrics = useMemo(() => {
    if (!negotiationState) return { round: 0, turns: 0, status: 'READY', agents: 0 };
    return {
      round: negotiationState.currentRound || 1,
      turns: negotiationState.negotiationHistory?.length || 0,
      status: String(negotiationState.negotiationStatus || 'IN_PROGRESS').replaceAll('_', ' '),
      agents: scenario?.agents?.length || 0,
    };
  }, [negotiationState, scenario]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" onClick={() => scrollTo('dashboard')} role="button" tabIndex={0}>
          <div className="brand-mark"><span>N</span></div>
          <div>
            <strong>NegoForge</strong>
            <small>Negotiation Intelligence</small>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`side-nav-item ${activeNav === item.id ? 'active' : ''}`}
              onClick={() => scrollTo(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="engine-card">
          <div className="live-dot" />
          <div>
            <strong>Engine Online</strong>
            <span>Decision services ready</span>
          </div>
        </div>
        <div className="sidebar-footer">AI MULTI-AGENT PLATFORM · v2.0</div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="breadcrumb">WORKSPACE <span>/</span> {activeNav.toUpperCase()}</div>
            <h1>{activeNav === 'dashboard' ? 'Negotiation command center' : activeNav === 'arena' ? 'Live negotiation arena' : 'Build your negotiation'}</h1>
          </div>
          <div className="topbar-actions">
            <div className="status-pill"><span className="live-dot" /> SYSTEM READY</div>
            <div className="avatar">KS</div>
          </div>
        </header>

        <section id="dashboard" className="dashboard-section">
          <div className="hero-panel">
            <div className="hero-copy">
              <div className="eyebrow"><span>✦</span> AI-POWERED NEGOTIATION INTELLIGENCE</div>
              <h2>Practice the deal.<br /><span>Understand the strategy.</span></h2>
              <p>Simulate high-stakes negotiations, control an AI persona, and inspect how every concession changes the deal.</p>
              <div className="hero-actions">
                <button className="primary-btn" onClick={() => scrollTo('setup')}>Start a negotiation <span>→</span></button>
                <button className="ghost-btn" onClick={() => scrollTo('insights')}>Explore intelligence</button>
              </div>
            </div>
            <div className="hero-orbit" aria-hidden="true">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><span>AI</span></div>
              <div className="orbit-node node-one">BUY</div><div className="orbit-node node-two">SELL</div><div className="orbit-node node-three">GOAL</div>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card"><span>SCENARIOS</span><strong>03</strong><small>Industry-ready templates</small></div>
            <div className="stat-card"><span>PERSONAS</span><strong>03</strong><small>Distinct negotiation styles</small></div>
            <div className="stat-card"><span>MODES</span><strong>02</strong><small>AI simulation + practice</small></div>
            <div className="stat-card accent"><span>ENGINE</span><strong>LIVE</strong><small>Orchestrator + decision services</small></div>
          </div>
        </section>

        <section id="setup" className="workspace-section">
          <div className="section-title-row">
            <div><span className="section-kicker">01 — CONFIGURATION</span><h2>Negotiation Lab</h2><p>Set the scenario, choose the interaction mode, and configure each negotiator.</p></div>
            <span className={`completion-badge ${isSetupComplete ? 'complete' : ''}`}>{isSetupComplete ? '✓ READY TO LAUNCH' : 'SETUP INCOMPLETE'}</span>
          </div>

          <div className="mode-grid modern-grid">
            <button className={`mode-card modern-card ${selectedMode === NEGOTIATION_MODE.SIMULATION ? 'selected-simulation' : ''}`} onClick={() => handleModeChange(NEGOTIATION_MODE.SIMULATION)}>
              <div className="card-top"><span className="feature-icon cyan">◉</span><span className="mini-status">AUTONOMOUS</span></div>
              <h3>AI vs AI</h3><p>Watch autonomous personas reason, bargain, concede and react without manual input.</p>
              <span className="card-link">Launch simulation →</span>
            </button>
            <button className={`mode-card modern-card ${selectedMode === NEGOTIATION_MODE.PRACTICE ? 'selected-practice' : ''}`} onClick={() => handleModeChange(NEGOTIATION_MODE.PRACTICE)}>
              <div className="card-top"><span className="feature-icon violet">◈</span><span className="mini-status violet-text">TRAINING</span></div>
              <h3>AI vs Human</h3><p>Take one side of the negotiation and test your decisions against an AI opponent.</p>
              <span className="card-link violet-text">Enter practice mode →</span>
            </button>
          </div>

          <div className="section-title-row compact"><div><span className="section-kicker">02 — SCENARIO</span><h2>Choose the negotiation</h2></div></div>
          <div className="scenario-grid modern-grid">
            {Object.entries(scenarios).map(([id, item]) => (
              <button key={id} className={`scenario-card modern-card ${selectedScenario === id ? 'selected' : ''}`} onClick={() => handleScenarioSelect(id)}>
                <div className="scenario-icon-large">{id === 'vendor' ? '◫' : id === 'job' ? '▣' : '◇'}</div>
                <div className="scenario-meta">{id === 'vendor' ? 'PROCUREMENT' : id === 'job' ? 'EXECUTIVE HR' : 'GOVERNANCE'}</div>
                <h3>{item.title}</h3><p>{item.description}</p>
                <span className="card-link">{selectedScenario === id ? '✓ Selected' : 'Configure scenario →'}</span>
              </button>
            ))}
          </div>

          {scenario && (
            <div className="configuration-panel">
              <div className="panel-heading"><div><span className="section-kicker">03 — AGENTS</span><h2>Persona configuration</h2></div><span>{scenario.agents.length} negotiators detected</span></div>

              {selectedMode === NEGOTIATION_MODE.PRACTICE && (
                <div className="human-role-panel">
                  <div><strong>Choose your role</strong><p>This agent becomes your controllable side in Practice Mode.</p></div>
                  <div className="role-options">
                    {scenario.agents.map((agent) => {
                      const id = agent.id || agent.name;
                      return <button key={id} className={humanRole === id ? 'role-selected' : ''} onClick={() => setHumanRole(id)}>{humanRole === id ? '✓ ' : ''}{agent.name}<small>{agent.role}</small></button>;
                    })}
                  </div>
                </div>
              )}

              <div className="agent-grid modern-grid">
                {scenario.agents.map((agent, index) => {
                  const agentId = agent.id || agent.name;
                  const isHuman = selectedMode === NEGOTIATION_MODE.PRACTICE && humanRole === agentId;
                  return (
                    <div className={`agent-card modern-card ${isHuman ? 'human-agent' : ''}`} key={agent.name}>
                      <div className="agent-header"><div className="agent-number">0{index + 1}</div><div><h3>{agent.name} {isHuman ? '· YOU' : '· AI'}</h3><span>{agent.role}</span></div><span className="agent-state">{isHuman ? 'CONTROLLED' : 'AUTONOMOUS'}</span></div>
                      <div className="agent-info"><div className="info-item"><label>OBJECTIVE</label><p>{agent.goal}</p></div><div className="info-item"><label>CONSTRAINT</label><p>{agent.constraint}</p></div></div>
                      <div className="personality"><label htmlFor={`personality-${index}`}>NEGOTIATION STYLE</label><select id={`personality-${index}`} value={agentPersonalities[agent.name] || ''} onChange={(event) => handlePersonalityChange(agent.name, event.target.value)}><option value="" disabled>Select personality</option>{personalityOptions.map((personality) => <option key={personality} value={personality}>{personality}</option>)}</select></div>
                    </div>
                  );
                })}
              </div>

              <div className="launch-panel"><div><span className="section-kicker">04 — DEPLOY</span><h2>{isSetupComplete ? 'System is ready.' : 'Complete the configuration.'}</h2><p>{isSetupComplete ? 'All required inputs are configured. Start the negotiation arena when ready.' : 'Select a scenario, assign a personality to every agent, and choose your role for Practice Mode.'}</p></div><button className="primary-btn launch-btn" onClick={handleStart} disabled={!isSetupComplete}>Launch Arena <span>→</span></button></div>
            </div>
          )}
        </section>

        {ready && negotiationState && (
          <section id="arena" className="workspace-section arena-section">
            <div className="section-title-row"><div><span className="section-kicker">LIVE SESSION</span><h2>Negotiation Arena</h2><p>{scenario?.title} · {selectedMode === NEGOTIATION_MODE.PRACTICE ? 'Human Practice' : 'Autonomous Simulation'}</p></div><button className="ghost-btn" onClick={handleReset}>← New session</button></div>
            <div className="live-overview">
              <div><span>ROUND</span><strong>{arenaMetrics.round}</strong></div><div><span>TURN LOG</span><strong>{arenaMetrics.turns}</strong></div><div><span>PARTICIPANTS</span><strong>{arenaMetrics.agents}</strong></div><div><span>STATUS</span><strong className="live-text">{arenaMetrics.status}</strong></div>
            </div>
            <NegotiationArenaPanel state={negotiationState} onStateChange={setNegotiationState} onReset={handleReset} />
          </section>
        )}

        <section id="insights" className="workspace-section insights-section">
          <div className="section-title-row"><div><span className="section-kicker">AI INTELLIGENCE</span><h2>Negotiation Insights</h2><p>Product-level intelligence layers that turn a simulator into a training platform.</p></div></div>
          <div className="insight-grid">
            <article className="insight-card"><span className="insight-number">01</span><h3>Strategy detection</h3><p>Surface anchors, aggressive bargaining, reciprocal concessions and compromise patterns from the transcript.</p><span>Strategy Engine</span></article>
            <article className="insight-card"><span className="insight-number">02</span><h3>Decision rationale</h3><p>Explain why an agent made a proposal using goals, opponent behavior, concession history and risk.</p><span>Explainable AI</span></article>
            <article className="insight-card"><span className="insight-number">03</span><h3>Performance report</h3><p>Convert each session into measurable negotiation signals such as flexibility, timing and value capture.</p><span>Training Analytics</span></article>
          </div>
          {negotiationState ? <div className="session-snapshot"><div><span className="section-kicker">CURRENT SESSION</span><h3>{scenario?.title}</h3><p>Session {negotiationState.negotiationId} is connected to the live arena above.</p></div><button className="ghost-btn" onClick={() => scrollTo('arena')}>Open live session →</button></div> : <div className="empty-insight"><span>✦</span><div><strong>No active session</strong><p>Launch a negotiation to populate live intelligence and outcome analytics.</p></div></div>}
        </section>

        <footer className="app-footer">NEGOFORGE <span>•</span> AI-POWERED NEGOTIATION INTELLIGENCE <span>•</span> BUILT FOR TRAINING & SIMULATION</footer>
      </main>
    </div>
  );
}

export default App;
