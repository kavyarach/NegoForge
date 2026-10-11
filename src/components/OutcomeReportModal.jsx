import { useState } from 'react';
import { ReportDownloadService } from '../services/ReportDownloadService';
import { NegotiationApi } from '../services/NegotiationApi';

export function OutcomeReportModal({ report, onClose }) {
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatusMessage, setEmailStatusMessage] = useState(null);

  if (!report) return null;

  const {
    scenarioTitle,
    status,
    roundsTaken,
    agreementTerm,
    currency = '₹',
    initialGap = 0,
    finalGap = 0,
    gapReductionPercentage = 0,
    totalConcessionVolume = 0,
    negotiationScore = 0,
    agent1Metrics,
    agent2Metrics,
    concessionTimeline = [],
    takeaways = [],
  } = report;

  const statusClass =
    status === 'AGREEMENT'
      ? 'm4-status-success'
      : status === 'DEADLOCK'
        ? 'm4-status-warning'
        : 'm4-status-danger';

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!recipientEmail) return;

    setEmailSending(true);
    setEmailStatusMessage(null);

    try {
      const res = await NegotiationApi.sendEmailReport(report.negotiationId, recipientEmail);
      if (res.success) {
        setEmailStatusMessage(`✅ ${res.message}`);
      } else {
        setEmailStatusMessage(`ℹ️ ${res.message}`);
      }
    } catch (err) {
      setEmailStatusMessage(`⚠️ Error sending email: ${err.message}`);
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <div className="m4-overlay">
      <div className="m4-modal">
        {/* HEADER */}
        <header className="m4-header">
          <div>
            <span className="m4-eyebrow">NEGOFORGE / OUTCOME ANALYSIS</span>
            <h2>Negotiation Outcome Report</h2>
            <p>{scenarioTitle}</p>
          </div>
          <button className="m4-close" onClick={onClose} aria-label="Close report">×</button>
        </header>

        {/* FINAL RESULT */}
        <section className={`m4-final-result ${statusClass}`}>
          <div>
            <span>FINAL STATUS</span>
            <strong>{status === 'AGREEMENT' ? 'AGREEMENT REACHED' : status}</strong>
          </div>
          <div className="m4-final-term">
            <span>FINAL AGREEMENT TERMS</span>
            <strong>{agreementTerm}</strong>
          </div>
        </section>

        {/* TOP METRICS */}
        <section className="m4-metrics">
          <Metric label="ROUNDS ELAPSED" value={roundsTaken} />
          <Metric label="INITIAL GAP" value={`${currency}${Number(initialGap).toLocaleString()}`} />
          <Metric label="FINAL GAP" value={`${currency}${Number(finalGap).toLocaleString()}`} />
          <Metric label="NEGOTIATION SCORE" value={`${negotiationScore}/100`} accent />
        </section>

        {/* CONVERGENCE */}
        <section className="m4-section">
          <div className="m4-section-title">
            <div>
              <small>01</small>
              <h3>Negotiation Convergence</h3>
            </div>
            <strong>{gapReductionPercentage}%</strong>
          </div>
          <div className="m4-progress">
            <div style={{ width: `${Math.min(100, Math.max(0, gapReductionPercentage))}%` }} />
          </div>
          <p>The negotiation reduced the original gap by <strong>{gapReductionPercentage}%</strong>.</p>
        </section>

        {/* AGENT SATISFACTION */}
        <section className="m4-section">
          <div className="m4-section-title">
            <div>
              <small>02</small>
              <h3>Objective Satisfaction</h3>
            </div>
          </div>
          <div className="m4-agents">
            <AgentCard agent={agent1Metrics} currency={currency} />
            <AgentCard agent={agent2Metrics} currency={currency} />
          </div>
        </section>

        {/* CONCESSION TIMELINE */}
        <section className="m4-section">
          <div className="m4-section-title">
            <div>
              <small>03</small>
              <h3>Concession Timeline</h3>
            </div>
            <strong>{currency}{Number(totalConcessionVolume).toLocaleString()}</strong>
          </div>

          {concessionTimeline.length === 0 ? (
            <div className="m4-empty">No concessions were recorded.</div>
          ) : (
            <div className="m4-timeline">
              {concessionTimeline.map((item, index) => (
                <div className="m4-timeline-item" key={`${item.agent}-${item.round}-${index}`}>
                  <div className="m4-dot" />
                  <div>
                    <strong>Round {item.round}</strong>
                    <span>{item.agent}</span>
                  </div>
                  <div className="m4-transition">
                    <span>{currency}{Number(item.previousValue).toLocaleString()}</span>
                    <b>→</b>
                    <strong>{currency}{Number(item.currentValue).toLocaleString()}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* TAKEAWAYS */}
        <section className="m4-section">
          <div className="m4-section-title">
            <div>
              <small>04</small>
              <h3>Strategic Takeaways</h3>
            </div>
          </div>
          <div className="m4-takeaways">
            {takeaways.map((item, index) => (
              <div key={index}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        {/* DOWNLOADS & EMAIL ACTION BAR */}
        <footer className="m4-footer" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            className="m4-download m4-primary"
            onClick={() => ReportDownloadService.downloadPdfReport(report)}
          >
            📄 Download Official PDF Report
          </button>

          <button
            className="m4-download"
            onClick={() => setEmailModalOpen(true)}
          >
            📧 Send Email Report
          </button>

          <button
            className="m4-download"
            onClick={() => ReportDownloadService.downloadSummary(report)}
          >
            ↓ Summary TXT
          </button>

          <button
            className="m4-download"
            onClick={() => ReportDownloadService.downloadCompleteReport(report)}
          >
            ↓ Complete JSON
          </button>
        </footer>

        {/* Send Email Modal Sub-dialog */}
        {emailModalOpen && (
          <div style={{ background: '#0f172a', border: '1px solid #263248', padding: '16px', borderRadius: '10px', marginTop: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>Email Results & Report</h4>
            {emailStatusMessage && (
              <div style={{ fontSize: '0.85rem', marginBottom: '10px', color: '#f1f5f9' }}>
                {emailStatusMessage}
              </div>
            )}
            <form onSubmit={handleSendEmail} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="email"
                required
                placeholder="recipient@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', background: '#111827', border: '1px solid #263248', color: '#f1f5f9', outline: 'none' }}
              />
              <button
                type="submit"
                disabled={emailSending}
                style={{ padding: '8px 16px', borderRadius: '6px', background: '#10b981', color: '#ffffff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
              >
                {emailSending ? 'Sending...' : 'Send Email →'}
              </button>
              <button
                type="button"
                onClick={() => { setEmailModalOpen(false); setEmailStatusMessage(null); }}
                style={{ padding: '8px 12px', borderRadius: '6px', background: '#263248', color: '#a8b3c7', border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        <button className="m4-return" onClick={onClose} style={{ marginTop: '16px' }}>
          Return to Negotiation Arena
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, accent = false }) {
  return (
    <div className="m4-metric">
      <span>{label}</span>
      <strong className={accent ? 'm4-accent' : ''}>{value}</strong>
    </div>
  );
}

function AgentCard({ agent, currency }) {
  if (!agent) return null;
  const satisfaction = agent.objectiveSatisfaction ?? 0;

  return (
    <div className="m4-agent">
      <div className="m4-agent-header">
        <div>
          <strong>{agent.name || agent.id}</strong>
          <span>{agent.role}</span>
        </div>
        <em>{agent.personality}</em>
      </div>
      <div className="m4-agent-info">
        <p><b>Goal</b>{agent.goal}</p>
        <p><b>Constraint</b>{agent.constraint}</p>
      </div>
      <div className="m4-satisfaction">
        <div>
          <span>Objective Satisfaction</span>
          <strong>{satisfaction}%</strong>
        </div>
        <div className="m4-progress small">
          <div style={{ width: `${satisfaction}%` }} />
        </div>
      </div>
      <div className="m4-agent-bottom">
        <span>Total Concession</span>
        <strong>{currency}{Number(agent.totalConcession || 0).toLocaleString()}</strong>
      </div>
    </div>
  );
}