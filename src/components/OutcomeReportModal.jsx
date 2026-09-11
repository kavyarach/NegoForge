export function OutcomeReportModal({ report, onClose }) {
  if (!report) return null;

  const {
    scenarioTitle,
    status,
    roundsTaken,
    agreementTerm,
    currency,
    initialGap,
    gapReductionPercentage,
    totalConcessionVolume,
    winWinScore,
    agent1Metrics,
    agent2Metrics,
    takeaways = [],
  } = report;

  const getStatusBadgeClass = (st) => {
    if (st === 'AGREEMENT') return 'status-agreement';
    if (st === 'DEADLOCK') return 'status-deadlock';
    return 'status-rejected';
  };

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 10, 20, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: '20px'
    }}>
      <div className="modal-content report-modal" style={{
        background: '#0f172a', borderRadius: '16px', border: '1px solid #334155',
        maxWidth: '800px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
        color: '#f8fafc', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #1e293b', paddingBottom: '20px', marginBottom: '24px' }}>
          <div>
            <span style={{ textTransform: 'uppercase', fontSize: '0.75rem', tracking: '0.1em', color: '#38bdf8', fontWeight: 600 }}>
              STRUCTURED OUTCOME REPORT
            </span>
            <h2 style={{ margin: '4px 0 0 0', fontSize: '1.75rem', fontWeight: 700 }}>{scenarioTitle}</h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.75rem', cursor: 'pointer', padding: '4px' }}
          >
            ✕
          </button>
        </div>

        {/* Summary Card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(30,41,59,0.8), rgba(15,23,42,0.9))',
          borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', padding: '20px', marginBottom: '24px',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px'
        }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>STATUS</span>
            <div style={{ marginTop: '4px' }}>
              <span className={`status-badge ${getStatusBadgeClass(status)}`} style={{ padding: '6px 12px', borderRadius: '20px', fontWeight: 600, fontSize: '0.9rem' }}>
                {status}
              </span>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>OUTCOME TERMs</span>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.2rem', color: status === 'AGREEMENT' ? '#34d399' : '#f87171' }}>
              {agreementTerm}
            </h3>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ROUNDS CONCLUDED</span>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.3rem' }}>{roundsTaken} Rounds</h3>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>WIN-WIN INDEX</span>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.3rem', color: '#fbbf24' }}>
              {winWinScore} / 100
            </h3>
          </div>
        </div>

        {/* Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          {/* Gap Reduction Card */}
          <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#38bdf8' }}>📊 Price Gap & Convergence</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.875rem' }}>
              <span>Initial Gap:</span>
              <strong>{currency}{initialGap.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.875rem' }}>
              <span>Gap Reduction Rate:</span>
              <strong style={{ color: '#34d399' }}>{gapReductionPercentage}%</strong>
            </div>

            {/* Visual Bar */}
            <div style={{ background: '#0f172a', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{
                width: `${gapReductionPercentage}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #38bdf8, #34d399)',
                transition: 'width 0.5s ease-in-out'
              }} />
            </div>
          </div>

          {/* Concession Volume Card */}
          <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#a78bfa' }}>🤝 Concession Dynamics</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.875rem' }}>
              <span>Total Concessions Made:</span>
              <strong>{currency}{totalConcessionVolume.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.875rem' }}>
              <span>{agent1Metrics.id}:</span>
              <strong>{currency}{agent1Metrics.totalConcession.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span>{agent2Metrics.id}:</span>
              <strong>{currency}{agent2Metrics.totalConcession.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        {/* Per-Agent Performance Breakdown */}
        <h4 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#f8fafc' }}>👥 Per-Agent Performance Breakdown</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          {[agent1Metrics, agent2Metrics].map((ag) => (
            <div key={ag.id} style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <strong style={{ fontSize: '1.1rem', color: '#60a5fa' }}>{ag.id}</strong>
                <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                  {ag.personality}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 8px 0' }}><strong>Goal:</strong> {ag.goal}</p>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 12px 0' }}><strong>Stance:</strong> {ag.stance}</p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '0.85rem' }}>Rating Score:</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: ag.performanceScore >= 80 ? '#34d399' : '#fbbf24' }}>
                  {ag.performanceScore} / 100
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Strategic Takeaways */}
        <div style={{ background: 'rgba(56, 189, 248, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.2)', marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#38bdf8' }}>💡 Key Strategic Takeaways</h4>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.6' }}>
            {takeaways.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '6px' }}>{item}</li>
            ))}
          </ul>
        </div>

        {/* Modal Footer */}
        <div style={{ textAlign: 'right' }}>
          <button
            onClick={onClose}
            className="btn btn-primary"
            style={{ padding: '10px 24px', fontSize: '0.95rem', borderRadius: '8px', cursor: 'pointer' }}
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}
