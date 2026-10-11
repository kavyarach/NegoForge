import { useState, useEffect } from 'react';
import { NegotiationApi } from '../services/NegotiationApi';

export function AICoachPanel({ state, onApplySuggestion }) {
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const negotiationId = state?.negotiationId;
  const currentRound = state?.currentRound;
  const historyLen = state?.negotiationHistory?.length;

  useEffect(() => {
    if (!negotiationId) return;

    let isMounted = true;

    NegotiationApi.getCoachingAdvice(negotiationId)
      .then((data) => {
        if (isMounted) setAdvice(data);
      })
      .catch((err) => console.error('Coach advice error:', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [negotiationId, currentRound, historyLen]);

  if (!advice && !loading) return null;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--primary-brand)',
        borderRadius: '14px',
        padding: '20px 24px',
        marginBottom: '24px',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.4rem' }}>💡</span>
          <div>
            <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--primary-brand)', fontWeight: 800 }}>
              Real-Time AI Negotiation Coach
            </h4>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {advice?.mode === 'SIMULATION'
                ? `Live strategy monitor • ${advice.targetAgentName || state.currentAgentTurn || 'Current AI'}`
                : 'Strategic guidance based on current round and opponent concession pattern'}
            </span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            padding: '6px 14px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {expanded ? 'Hide Coach ▲' : 'Show Coach ▼'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: '18px' }}>
          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
              Analyzing negotiation stance and calculating optimal trade-offs...
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '14px',
                  marginBottom: '18px',
                }}
              >
                {/* Conservative Suggestion */}
                {advice.conservative && (
                  <div style={cardStyle('#0284c7')}>
                    <span style={badgeStyle('#0284c7')}>CONSERVATIVE MOVE</span>
                    <p style={descStyle}>{advice.conservative.description}</p>
                    {advice.conservative.value && (
                      <button
                        onClick={() => onApplySuggestion(advice.conservative)}
                        style={applyBtnStyle('#0284c7')}
                      >
                        {advice?.mode === 'SIMULATION' ? 'Apply to Next AI Turn →' : 'Apply Move →'}
                      </button>
                    )}
                  </div>
                )}

                {/* Balanced Suggestion */}
                {advice.balanced && (
                  <div style={cardStyle('#059669')}>
                    <span style={badgeStyle('#059669')}>BALANCED (RECOMMENDED)</span>
                    <p style={descStyle}>{advice.balanced.description}</p>
                    {advice.balanced.value && (
                      <button
                        onClick={() => onApplySuggestion(advice.balanced)}
                        style={applyBtnStyle('#059669')}
                      >
                        {advice?.mode === 'SIMULATION' ? 'Apply to Next AI Turn →' : 'Apply Move →'}
                      </button>
                    )}
                  </div>
                )}

                {/* Aggressive Suggestion */}
                {advice.aggressive && (
                  <div style={cardStyle('#d97706')}>
                    <span style={badgeStyle('#d97706')}>AGGRESSIVE MOVE</span>
                    <p style={descStyle}>{advice.aggressive.description}</p>
                    {advice.aggressive.value && (
                      <button
                        onClick={() => onApplySuggestion(advice.aggressive)}
                        style={applyBtnStyle('#d97706')}
                      >
                        {advice?.mode === 'SIMULATION' ? 'Apply to Next AI Turn →' : 'Apply Move →'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Multi-issue Trade-Offs */}
              {advice.tradeOffOpportunities && advice.tradeOffOpportunities.length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', padding: '14px 18px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ⚡ Recommended Multi-Issue Trade-Off Opportunities:
                  </span>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
                    {advice.tradeOffOpportunities.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const cardStyle = (color) => ({
  background: 'var(--bg-secondary)',
  border: `1px solid ${color}`,
  borderRadius: '10px',
  padding: '14px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
});

const badgeStyle = (color) => ({
  fontSize: '0.75rem',
  fontWeight: 800,
  color,
  textTransform: 'uppercase',
  marginBottom: '8px',
  letterSpacing: '0.05em',
});

const descStyle = {
  fontSize: '0.9rem',
  color: 'var(--text-primary)',
  margin: '0 0 12px 0',
  lineHeight: '1.5',
  flexGrow: 1,
};

const applyBtnStyle = (color) => ({
  background: color,
  color: '#ffffff',
  border: 'none',
  padding: '8px 14px',
  borderRadius: '8px',
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
  alignSelf: 'flex-start',
});
