import { useState, useEffect } from 'react';
import './App.css';
import { scenarios, personalityOptions, difficultyOptions } from './constants/scenarios';
import { NEGOTIATION_MODE } from './constants/negotiationConstants';
import { NegotiationApi } from './services/NegotiationApi';
import { NegotiationArenaPanel } from './components/NegotiationArenaPanel';
import { AuthModal } from './components/AuthModal';
import { NegotiationChatbot } from './components/NegotiationChatbot';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: GridIcon },
  { id: 'negotiate', label: 'New Negotiation', icon: BoltIcon },
  { id: 'scenarios', label: 'Scenarios', icon: LayersIcon },
  { id: 'sessions', label: 'Sessions', icon: ClockIcon },
  { id: 'reports', label: 'Reports', icon: ReportIcon },
];

function App() {
  const [selectedMode, setSelectedMode] = useState(NEGOTIATION_MODE.PRACTICE);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [agentPersonalities, setAgentPersonalities] = useState({});
  const [humanRole, setHumanRole] = useState(null);
  const [difficulty, setDifficulty] = useState('Medium');
  const [ready, setReady] = useState(false);
  const [negotiationState, setNegotiationState] = useState(null);
  const [activeView, setActiveView] = useState('dashboard');

  // Auth & User state
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('negoforge_user') || 'null');
    } catch (_e) {
      return null;
    }
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('negoforge_theme');
    if (!saved || saved === 'dark') {
      localStorage.setItem('negoforge_theme', 'light');
      return 'light';
    }
    return saved;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('negoforge_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLogout = () => {
    localStorage.removeItem('negoforge_auth_token');
    localStorage.removeItem('negoforge_user');
    setUser(null);
    setReady(false);
    setNegotiationState(null);
    setActiveView('dashboard');
    setAuthModalOpen(true);
  };

  const scenario = selectedScenario ? scenarios[selectedScenario] : null;

  const handleScenarioSelect = (scenarioId) => {
    setSelectedScenario(scenarioId);
    setAgentPersonalities({});
    const sc = scenarios[scenarioId];
    const defaultRole = sc && sc.agents && sc.agents[0] ? (sc.agents[0].id || sc.agents[0].name) : null;
    setHumanRole(defaultRole);
    setReady(false);
    setNegotiationState(null);
    setActiveView('negotiate');
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
    (selectedMode === NEGOTIATION_MODE.SIMULATION ||
      (selectedMode === NEGOTIATION_MODE.PRACTICE && humanRole));

  const handleStart = async () => {
    if (!isSetupComplete || !scenario) return;

    // Negotiations are persisted and authorized by the backend. Require an
    // authenticated user before creating a real session.
    if (!user || !localStorage.getItem('negoforge_auth_token')) {
      setAuthModalOpen(true);
      return;
    }

    try {
      const state = await NegotiationApi.createNegotiation(
        scenario,
        agentPersonalities,
        selectedMode,
        humanRole,
        difficulty
      );
      setNegotiationState(state);
      setReady(true);
      setActiveView('negotiation');
    } catch (err) {
      console.error('Failed to create negotiation:', err);
      if (err?.status === 401) {
        localStorage.removeItem('negoforge_auth_token');
        setUser(null);
        setAuthModalOpen(true);
      }
    }
  };

  const handleReset = () => {
    setReady(false);
    setNegotiationState(null);
    setActiveView('negotiate');
  };

  const handleNav = (view) => {
    if (view === 'negotiate') {
      setReady(false);
      setNegotiationState(null);
      setActiveView('negotiate');
      return;
    }

    if (view === 'scenarios') {
      setActiveView('scenarios');
      return;
    }

    setActiveView(view);
  };

  const activeLabel =
    activeView === 'dashboard'
      ? 'Dashboard'
      : activeView === 'scenarios'
        ? 'Scenarios'
        : activeView === 'sessions'
          ? 'Sessions'
          : activeView === 'reports'
            ? 'Reports'
            : activeView === 'profile'
              ? 'Profile'
              : ready
                ? 'Negotiation Arena'
                : 'New Negotiation';

  return (
    <div className={`app-shell theme-${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <strong>NegoForge</strong>
            <span>Negotiation workspace</span>
          </div>
        </div>

        <div className="sidebar-label">Workspace</div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${activeView === id ? 'active' : ''}`}
              onClick={() => handleNav(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-status">
          <span className="status-dot" />
          <div>
            <strong>System ready</strong>
            <span>Negotiation engine online</span>
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="nav-item muted" onClick={() => setActiveView('settings')}>
            <SettingsIcon />
            <span>Settings</span>
          </button>
          <button className="nav-item muted" onClick={() => setActiveView('help')}>
            <HelpIcon />
            <span>Help & Guide</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>NegoForge</span>
            <ChevronIcon />
            <strong>{activeLabel}</strong>
          </div>

          <div className="topbar-actions">
            {scenario && (
              <span className="topbar-context">
                {selectedMode === NEGOTIATION_MODE.PRACTICE ? 'Practice' : 'Simulation'} · {scenario.title}
              </span>
            )}
            <button className="ghost-button" onClick={toggleTheme} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>

            {user ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className="nav-item"
                  onClick={() => setActiveView('profile')}
                  style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid #38bdf8', color: '#38bdf8', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
                >
                  👤 {user.name}
                </button>
                <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: '#a8b3c7', cursor: 'pointer', fontSize: '0.8rem' }}>
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                className="primary-button"
                onClick={() => setAuthModalOpen(true)}
                style={{ padding: '6px 14px', fontSize: '0.85rem' }}
              >
                Sign In
              </button>
            )}

            <button
              className="topbar-new"
              onClick={() => {
                setActiveView('negotiate');
                setReady(false);
                setNegotiationState(null);
              }}
            >
              <PlusIcon />
              New negotiation
            </button>
          </div>
        </header>

        <main className="workspace">
          {activeView === 'dashboard' && (
            <Dashboard
              onNew={() => setActiveView('negotiate')}
              onScenario={handleScenarioSelect}
            />
          )}

          {activeView === 'scenarios' && (
            <ScenarioLibrary
              onSelect={handleScenarioSelect}
            />
          )}

          {activeView === 'sessions' && (
            <SessionsView
              ready={ready}
              negotiationState={negotiationState}
              scenario={scenario}
              selectedMode={selectedMode}
              onOpenSession={() => setActiveView('negotiation')}
              onNew={() => setActiveView('negotiate')}
            />
          )}

          {activeView === 'reports' && (
            <ReportsView
              ready={ready}
              negotiationState={negotiationState}
              scenario={scenario}
              selectedMode={selectedMode}
              onReturn={() => setActiveView('negotiation')}
              onNew={() => setActiveView('negotiate')}
            />
          )}

          {activeView === 'profile' && (
            <ProfileView user={user} onUpdate={(updated) => setUser(updated)} />
          )}

          {activeView === 'settings' && (
            <SettingsView theme={theme} onToggleTheme={toggleTheme} />
          )}

          {activeView === 'help' && (
            <HelpView />
          )}

          {activeView === 'negotiate' && !ready && (
            <NegotiationSetup
              selectedMode={selectedMode}
              selectedScenario={selectedScenario}
              scenario={scenario}
              agentPersonalities={agentPersonalities}
              humanRole={humanRole}
              difficulty={difficulty}
              isSetupComplete={isSetupComplete}
              onModeChange={handleModeChange}
              onScenarioSelect={handleScenarioSelect}
              onHumanRole={setHumanRole}
              onDifficultyChange={setDifficulty}
              onPersonalityChange={handlePersonalityChange}
              onStart={handleStart}
            />
          )}

          {activeView === 'negotiation' && ready && negotiationState && (
            <div className="arena-page">
              <div className="arena-page-header">
                <div>
                  <div className="eyebrow-row">
                    <span className="live-dot" />
                    <span>{selectedMode === NEGOTIATION_MODE.PRACTICE ? 'Practice session' : 'Live simulation'}</span>
                  </div>
                  <h1>{scenario?.title}</h1>
                  <p>
                    {selectedMode === NEGOTIATION_MODE.PRACTICE
                      ? `Interactive negotiation as ${humanRole}.`
                      : 'Autonomous multi-agent negotiation in progress.'}
                  </p>
                </div>
                <button className="ghost-button" onClick={handleReset}>
                  Exit session
                </button>
              </div>

              <NegotiationArenaPanel
                state={negotiationState}
                onStateChange={setNegotiationState}
                onReset={handleReset}
              />
            </div>
          )}
        </main>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={(u) => setUser(u)}
      />

      <NegotiationChatbot activeState={negotiationState} />
    </div>
  );
}

function NegotiationSetup({
  selectedMode,
  selectedScenario,
  scenario,
  agentPersonalities,
  humanRole,
  difficulty,
  isSetupComplete,
  onModeChange,
  onScenarioSelect,
  onHumanRole,
  onDifficultyChange,
  onPersonalityChange,
  onStart,
}) {
  return (
    <div className="setup-page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">NEGOTIATION WORKSPACE</span>
          <h1>Set up a negotiation</h1>
          <p>Choose a mode, select a scenario, set difficulty, and configure the participants.</p>
        </div>
      </div>

      <section className="setup-block">
        <div className="block-heading">
          <div className="block-number">01</div>
          <div>
            <h2>Choose a mode & difficulty</h2>
            <p>Decide how the negotiation should run and set AI strategy difficulty.</p>
          </div>
        </div>

        <div className="mode-grid app-mode-grid">
          <button
            className={`mode-card app-mode-card ${selectedMode === NEGOTIATION_MODE.SIMULATION ? 'selected-simulation' : ''}`}
            onClick={() => onModeChange(NEGOTIATION_MODE.SIMULATION)}
          >
            <div className="card-icon cyan"><BoltIcon /></div>
            <div className="card-copy">
              <div className="card-title-row">
                <h3>Simulation</h3>
                <span className="mini-status">AI vs AI</span>
              </div>
              <p>Watch two configured AI personas negotiate automatically.</p>
            </div>
            <ArrowIcon />
          </button>

          <button
            className={`mode-card app-mode-card ${selectedMode === NEGOTIATION_MODE.PRACTICE ? 'selected-practice' : ''}`}
            onClick={() => onModeChange(NEGOTIATION_MODE.PRACTICE)}
          >
            <div className="card-icon violet"><UserIcon /></div>
            <div className="card-copy">
              <div className="card-title-row">
                <h3>Practice</h3>
                <span className="mini-status violet">Human vs AI</span>
              </div>
              <p>Take one side of the negotiation and respond to an AI counterpart.</p>
            </div>
            <ArrowIcon />
          </button>
        </div>

        <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '0.85rem', color: '#a8b3c7', fontWeight: 700 }}>DIFFICULTY LEVEL:</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {difficultyOptions.map((diff) => (
              <button
                key={diff}
                type="button"
                className={`btn ${difficulty === diff ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => onDifficultyChange(diff)}
                style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                {diff === 'Easy' ? '🟢 Easy' : diff === 'Medium' ? '🟡 Medium' : '🔴 Hard'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="setup-block">
        <div className="block-heading">
          <div className="block-number">02</div>
          <div>
            <h2>Select a scenario</h2>
            <p>Start from one of the three built-in negotiation environments.</p>
          </div>
        </div>

        <div className="scenario-grid app-scenario-grid">
          {Object.entries(scenarios).map(([id, item]) => (
            <button
              key={id}
              className={`scenario-card app-scenario-card ${selectedScenario === id ? 'selected' : ''}`}
              onClick={() => onScenarioSelect(id)}
            >
              <div className={`scenario-icon scenario-icon-${id}`}>
                {id === 'vendor' ? <CartIcon /> : id === 'job' ? <BriefcaseIcon /> : <ChartIcon />}
              </div>
              <div className="scenario-copy">
                <span className="scenario-type">{id === 'vendor' ? 'PROCUREMENT' : id === 'job' ? 'CAREER' : 'PROJECT'}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
              <span className="scenario-action">
                {selectedScenario === id ? 'Selected' : 'Choose scenario'}
                <ArrowIcon />
              </span>
            </button>
          ))}
        </div>
      </section>

      {scenario && (
        <section className="setup-block">
          <div className="block-heading">
            <div className="block-number">03</div>
            <div>
              <h2>Configure participants</h2>
              <p>Define the negotiation personalities before entering the arena.</p>
            </div>
          </div>

          {selectedMode === NEGOTIATION_MODE.PRACTICE && (
            <div className="role-picker">
              <div className="role-picker-heading">
                <div className="role-icon"><UserIcon /></div>
                <div>
                  <strong>Choose your role</strong>
                  <span>Select which participant you will control.</span>
                </div>
              </div>
              <div className="role-options">
                {scenario.agents.map((agent) => {
                  const agId = agent.id || agent.name;
                  const isSelected = humanRole === agId;
                  return (
                    <button
                      key={agId}
                      type="button"
                      className={`role-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => onHumanRole(agId)}
                    >
                      <span className="role-radio">{isSelected ? '✓' : ''}</span>
                      <div>
                        <strong>{agent.name}</strong>
                        <span>{agent.role}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="agent-grid app-agent-grid">
            {scenario.agents.map((agent, index) => {
              const agentId = agent.id || agent.name;
              const isHumanControlled =
                selectedMode === NEGOTIATION_MODE.PRACTICE && humanRole === agentId;

              return (
                <div className={`agent-card app-agent-card ${isHumanControlled ? 'human-agent' : ''}`} key={agent.name}>
                  <div className="agent-header">
                    <div className={`agent-number agent-number-${index + 1}`}>{String(index + 1).padStart(2, '0')}</div>
                    <div>
                      <h3>{agent.name}</h3>
                      <span>{agent.role}</span>
                    </div>
                    <span className={`agent-chip ${isHumanControlled ? 'human' : ''}`}>
                      {isHumanControlled ? 'YOU' : 'AI'}
                    </span>
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
                    <label htmlFor={`personality-${index}`}>PERSONALITY</label>
                    <select
                      id={`personality-${index}`}
                      value={agentPersonalities[agent.name] || ''}
                      onChange={(event) => onPersonalityChange(agent.name, event.target.value)}
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

          <div className="launch-bar">
            <div>
              <span className="launch-label">READY WHEN YOU ARE</span>
              <strong>
                {isSetupComplete
                  ? `${scenario.title} (${difficulty}) is configured`
                  : 'Complete the participant configuration'}
              </strong>
            </div>
            <button className="start-button app-start-button" onClick={onStart} disabled={!isSetupComplete}>
              Start negotiation
              <ArrowIcon />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Dashboard({ onNew, onScenario }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    NegotiationApi.getDashboardStats().then((data) => setStats(data));
  }, []);

  return (
    <div className="dashboard-page">
      <div className="page-heading dashboard-heading">
        <div>
          <span className="page-kicker">WORKSPACE</span>
          <h1>Negotiation dashboard</h1>
          <p>Run simulations, practice negotiation, and review outcomes with live analytics.</p>
        </div>
        <button className="primary-button" onClick={onNew}>
          <PlusIcon /> New negotiation
        </button>
      </div>

      <div className="dashboard-grid">
        <button className="dashboard-action primary" onClick={onNew}>
          <div className="action-icon"><BoltIcon /></div>
          <div>
            <span>QUICK START</span>
            <strong>New negotiation</strong>
            <p>Configure participants and enter the arena.</p>
          </div>
          <ArrowIcon />
        </button>

        <div className="dashboard-stat">
          <span>TOTAL NEGOTIATIONS</span>
          <strong>{stats ? stats.totalNegotiations : '—'}</strong>
          <p>Calculated from stored session history.</p>
        </div>

        <div className="dashboard-stat">
          <span>SUCCESSFUL AGREEMENTS</span>
          <strong style={{ color: '#10b981' }}>{stats ? stats.successfulAgreements : '—'}</strong>
          <p>Agreements settled within limits.</p>
        </div>

        <div className="dashboard-stat">
          <span>AGREEMENT RATE</span>
          <strong style={{ color: '#38bdf8' }}>{stats ? `${stats.agreementRatePercentage}%` : '—'}</strong>
          <p>Overall negotiation success percentage.</p>
        </div>
      </div>

      <section className="dashboard-section">
        <div className="section-inline-heading">
          <div>
            <span className="page-kicker">SCENARIO LIBRARY</span>
            <h2>Start from a template</h2>
          </div>
          <button className="text-button" onClick={() => onScenario('vendor')}>View scenarios <ArrowIcon /></button>
        </div>

        <div className="dashboard-scenarios">
          {Object.entries(scenarios).map(([id, item]) => (
            <button className="dashboard-scenario" key={id} onClick={() => onScenario(id)}>
              <div className={`scenario-icon scenario-icon-${id}`}>
                {id === 'vendor' ? <CartIcon /> : id === 'job' ? <BriefcaseIcon /> : <ChartIcon />}
              </div>
              <div>
                <span>{id === 'vendor' ? 'PROCUREMENT' : id === 'job' ? 'CAREER' : 'PROJECT'}</span>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
              <ArrowIcon />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ScenarioLibrary({ onSelect }) {
  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">SCENARIOS</span>
          <h1>Negotiation templates</h1>
          <p>Choose a scenario and configure it for your next session.</p>
        </div>
      </div>
      <div className="scenario-library-grid">
        {Object.entries(scenarios).map(([id, item]) => (
          <button key={id} className="library-card" onClick={() => onSelect(id)}>
            <div className={`scenario-icon scenario-icon-${id}`}>
              {id === 'vendor' ? <CartIcon /> : id === 'job' ? <BriefcaseIcon /> : <ChartIcon />}
            </div>
            <span>{id === 'vendor' ? 'PROCUREMENT' : id === 'job' ? 'CAREER' : 'PROJECT'}</span>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <div className="library-card-footer">Configure scenario <ArrowIcon /></div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SessionsView({ ready, negotiationState, scenario, selectedMode, onOpenSession, onNew }) {
  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">SESSIONS</span>
          <h1>Negotiation sessions</h1>
          <p>Review your active and saved negotiation sessions.</p>
        </div>
      </div>

      {ready && negotiationState ? (
        <div className="settings-card">
          <div><strong>Scenario</strong><span>{scenario?.title}</span></div>
          <div><strong>Mode</strong><span>{selectedMode === NEGOTIATION_MODE.PRACTICE ? 'Human vs AI Practice' : 'AI vs AI Simulation'}</span></div>
          <div><strong>Status</strong><span>{negotiationState.negotiationStatus}</span></div>
          <div><strong>Round</strong><span>Round {negotiationState.currentRound}</span></div>
          <button className="primary-button" onClick={onOpenSession} style={{ marginTop: '16px' }}>
            Open session <ArrowIcon />
          </button>
        </div>
      ) : (
        <EmptyWorkspace
          icon={<ClockIcon />}
          title="No active sessions"
          description="Start a negotiation and your session will be saved here."
          actionLabel="Start a negotiation"
          onAction={onNew}
        />
      )}
    </div>
  );
}

function ReportsView({ ready, negotiationState, scenario, selectedMode, onReturn, onNew }) {
  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">REPORTS</span>
          <h1>Negotiation reports</h1>
          <p>Review outcomes and download reports.</p>
        </div>
      </div>

      {ready && negotiationState ? (
        <div className="settings-card">
          <div><strong>Scenario</strong><span>{scenario?.title}</span></div>
          <div><strong>Mode</strong><span>{selectedMode === NEGOTIATION_MODE.PRACTICE ? 'Human vs AI' : 'AI vs AI'}</span></div>
          <div><strong>Status</strong><span>{negotiationState.negotiationStatus}</span></div>
          <button className="primary-button" onClick={onReturn} style={{ marginTop: '16px' }}>
            Return to session <ArrowIcon />
          </button>
        </div>
      ) : (
        <EmptyWorkspace
          icon={<ReportIcon />}
          title="Reports generated after session"
          description="Complete a negotiation to open its outcome analysis and report."
          actionLabel="Start a negotiation"
          onAction={onNew}
        />
      )}
    </div>
  );
}

function ProfileView({ user }) {

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">USER PROFILE</span>
          <h1>Account settings & profile</h1>
          <p>Manage your account details and negotiation preferences.</p>
        </div>
      </div>

      <div className="settings-card" style={{ maxWidth: '500px' }}>
        <div><strong>Name</strong><span>{user?.name || 'Not signed in'}</span></div>
        <div><strong>Email</strong><span>{user?.email || '—'}</span></div>
        <div><strong>Language</strong><span>{user?.preferred_language || 'English'}</span></div>
        <div><strong>Theme</strong><span>{user?.theme || 'Dark'}</span></div>
      </div>
    </div>
  );
}

function EmptyWorkspace({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="empty-workspace">
      <div className="empty-icon">{icon}</div>
      <span className="page-kicker">WORKSPACE</span>
      <h1>{title}</h1>
      <p>{description}</p>
      <button className="primary-button" onClick={onAction}>
        {actionLabel} <ArrowIcon />
      </button>
    </div>
  );
}

function SettingsView({ theme, onToggleTheme }) {
  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">SYSTEM</span>
          <h1>Workspace settings</h1>
          <p>Interface preferences for the NegoForge workspace.</p>
        </div>
      </div>
      <div className="settings-card">
        <div><strong>Theme Mode</strong><span>{theme === 'dark' ? 'Dark Workspace' : 'Light Workspace'}</span></div>
        <button className="btn btn-secondary" onClick={onToggleTheme} style={{ marginTop: '12px', padding: '8px 16px' }}>
          Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
        </button>
      </div>
    </div>
  );
}

function HelpView() {
  return (
    <div className="empty-workspace">
      <div className="empty-icon"><HelpIcon /></div>
      <span className="page-kicker">GUIDE</span>
      <h1>How NegoForge works</h1>
      <p>Choose a mode, select a scenario, configure the participants, then enter the negotiation arena.</p>
      <button className="primary-button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        Got it <ArrowIcon />
      </button>
    </div>
  );
}

function GridIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
}
function BoltIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4.5 13h6l-1 9L19.5 11h-6L13 2Z" /></svg>;
}
function LayersIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4" /><path d="m4 16 8 4 8-4" /></svg>;
}
function ClockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>;
}
function ReportIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8l4 4V20.5H6z" /><path d="M14 3.5v4h4M9 12h6M9 16h6" /></svg>;
}
function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="m19 13.5 1.3 1-.1.2-1.7 2.9-.2-.1-1.5-.5a7.8 7.8 0 0 1-1.5.9l-.2 1.6h-3.4l-.2-1.6a7.8 7.8 0 0 1-1.5-.9l-1.5.5-.2.1-1.7-2.9.1-.2 1.3-1a7.4 7.4 0 0 1 0-1.8l-1.3-1 .1-.2 1.7-2.9.2.1 1.5.5a7.8 7.8 0 0 1 1.5-.9l.2-1.6h3.4l.2 1.6a7.8 7.8 0 0 1 1.5.9l1.5-.5.2-.1 1.7 2.9-.1.2-1.3 1a7.4 7.4 0 0 1 0 1.8Z" /></svg>;
}
function HelpIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 4.2 1.6c-.9 1-1.9 1.2-1.9 2.7M12 16.8h.01" /></svg>;
}
function UserIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19c.8-3.2 3-5 6.5-5s5.7 1.8 6.5 5" /></svg>;
}
function PlusIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}
function ChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;
}
function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 7l5 5-5 5" /></svg>;
}
function CartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h2l1.2 9h10.6l1.5-6H7" /><circle cx="9" cy="18" r="1.5" /><circle cx="17" cy="18" r="1.5" /></svg>;
}
function BriefcaseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="16" height="12" rx="2" /><path d="M9 7V5h6v2M4 11h16M10 11v2h4v-2" /></svg>;
}
function ChartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7" /><path d="M3 19h18" /></svg>;
}

export default App;
