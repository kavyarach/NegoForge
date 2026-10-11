import React from 'react';

/**
 * Visual Analytics & Charts component for NegoForge Negotiation Engine.
 * Renders SVG Line Charts, Bar Charts, Donut Charts, and Concession Trajectory Graphs.
 */
export function NegotiationAnalyticsCharts({ history = [], scenario = {}, report = null }) {
  const currency = scenario?.currencySymbol || '₹';
  const agents = scenario?.agents || [];
  const agent1Name = agents[0] ? (agents[0].id || agents[0].name) : 'Agent 1';
  const agent2Name = agents[1] ? (agents[1].id || agents[1].name) : 'Agent 2';

  // Process history data for line chart
  const rounds = Array.from(new Set(history.map((h) => h.round))).sort((a, b) => a - b);
  
  // Extract offer history per agent per round
  const agent1Data = [];
  const agent2Data = [];

  history.forEach((entry) => {
    if (entry.offer && entry.offer.value) {
      if (entry.agent === agent1Name) {
        agent1Data.push({ round: entry.round, value: entry.offer.value });
      } else {
        agent2Data.push({ round: entry.round, value: entry.offer.value });
      }
    }
  });

  // Collect all values to compute min/max scaling
  const allValues = history
    .filter((h) => h.offer && h.offer.value)
    .map((h) => h.offer.value);

  const initialVal1 = scenario?.initialOfferValue || 100000;
  const initialVal2 = agents[1]?.baselineTarget || 80000;
  allValues.push(initialVal1, initialVal2);

  const minVal = Math.min(...allValues) * 0.95;
  const maxVal = Math.max(...allValues) * 1.05;
  const valRange = maxVal - minVal || 1;

  // SVG dimensions for Line Chart
  const svgWidth = 600;
  const svgHeight = 240;
  const paddingLeft = 65;
  const paddingBottom = 35;
  const paddingTop = 20;
  const paddingRight = 25;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const getX = (round) => {
    const totalRounds = Math.max(5, rounds.length);
    return paddingLeft + ((round - 1) / (totalRounds - 1 || 1)) * chartWidth;
  };

  const getY = (val) => {
    return paddingTop + chartHeight - ((val - minVal) / valRange) * chartHeight;
  };

  // Build SVG path strings
  const buildPath = (data) => {
    if (data.length === 0) return '';
    return data
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(pt.round)} ${getY(pt.value)}`)
      .join(' ');
  };

  const agent1Path = buildPath(agent1Data);
  const agent2Path = buildPath(agent2Data);

  // Action Type Distribution for Donut Chart
  const actionCounts = history.reduce((acc, h) => {
    const act = h.action || h.decision || 'OFFER';
    acc[act] = (acc[act] || 0) + 1;
    return acc;
  }, {});

  const totalActions = history.length || 1;
  const counterofferCount = actionCounts['COUNTEROFFER'] || 0;
  const offerCount = actionCounts['OFFER'] || 0;
  const acceptCount = actionCounts['ACCEPT'] || 0;
  const rejectCount = actionCounts['REJECT'] || 0;

  return (
    <div className="analytics-charts-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', margin: '20px 0' }}>
      {/* 1. LINE GRAPH: PRICE CONVERGENCE TRAJECTORY */}
      <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '14px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              📈 Price Convergence Trajectory
            </h4>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Offer Values over Rounds</span>
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', fontWeight: 700 }}>
            <span style={{ color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', background: '#0284c7', borderRadius: '50%' }}></span>
              {agent1Name}
            </span>
            <span style={{ color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', background: '#7c3aed', borderRadius: '50%' }}></span>
              {agent2Name}
            </span>
          </div>
        </div>

        {history.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No negotiation exchanges recorded yet. Execute turns to view trajectory chart.
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'auto', background: 'var(--bg-secondary)', borderRadius: '10px' }}>
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const y = paddingTop + chartHeight * (1 - pct);
                const val = Math.round(minVal + pct * valRange);
                return (
                  <g key={idx}>
                    <line x1={paddingLeft} y1={y} x2={svgWidth - paddingRight} y2={y} stroke="var(--border-color)" strokeDasharray="3 3" />
                    <text x={paddingLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)" fontWeight="600">
                      {currency}{val.toLocaleString()}
                    </text>
                  </g>
                );
              })}

              {/* X-Axis Round Labels */}
              {[1, 2, 3, 4, 5].map((r) => {
                const x = getX(r);
                return (
                  <g key={r}>
                    <line x1={x} y1={paddingTop} x2={x} y2={paddingTop + chartHeight} stroke="var(--border-subtle)" strokeDasharray="2 2" />
                    <text x={x} y={svgHeight - 10} textAnchor="middle" fontSize="11" fill="var(--text-muted)" fontWeight="700">
                      R{r}
                    </text>
                  </g>
                );
              })}

              {/* Agent 1 Path */}
              {agent1Path && (
                <path d={agent1Path} fill="none" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              )}

              {/* Agent 2 Path */}
              {agent2Path && (
                <path d={agent2Path} fill="none" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              )}

              {/* Data Points */}
              {agent1Data.map((pt, i) => (
                <g key={`a1-${i}`}>
                  <circle cx={getX(pt.round)} cy={getY(pt.value)} r="5" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
                  <title>{`${agent1Name} (Round ${pt.round}): ${currency}${pt.value.toLocaleString()}`}</title>
                </g>
              ))}

              {agent2Data.map((pt, i) => (
                <g key={`a2-${i}`}>
                  <circle cx={getX(pt.round)} cy={getY(pt.value)} r="5" fill="#7c3aed" stroke="#ffffff" strokeWidth="2" />
                  <title>{`${agent2Name} (Round ${pt.round}): ${currency}${pt.value.toLocaleString()}`}</title>
                </g>
              ))}
            </svg>
          </div>
        )}
      </div>

      {/* 2. BAR CHART: CONCESSION VOLUMES PER ROUND */}
      <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '14px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
        <h4 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
          📊 Round Concession Volumes
        </h4>
        <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Value conceded per round in currency ({currency})
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {history.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No concession data available yet.
            </div>
          ) : (
            history.map((h, i) => {
              if (!h.concession || !h.concession.concessionAmount) return null;
              const maxConcession = Math.max(...history.map((x) => x.concession?.concessionAmount || 1), 1000);
              const pct = Math.min(100, Math.max(10, Math.round((h.concession.concessionAmount / maxConcession) * 100)));
              const isA1 = h.agent === agent1Name;

              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isA1 ? '#0284c7' : '#7c3aed' }}>
                    R{h.round} {h.agent?.substring(0, 5)}
                  </span>
                  <div style={{ background: 'var(--bg-secondary)', height: '18px', borderRadius: '9px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: isA1 ? '#0284c7' : '#7c3aed', borderRadius: '9px', transition: 'width 0.3s ease' }} />
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)', textAnchor: 'end' }}>
                    {currency}{h.concession.concessionAmount.toLocaleString()}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. DONUT CHART & STRATEGY DISTRIBUTION */}
      <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '14px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
        <h4 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
          🍩 Negotiation Action Breakdown
        </h4>
        <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Distribution of strategic decisions across exchanges
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '16px' }}>
          <svg viewBox="0 0 100 100" style={{ width: '120px', height: '120px', transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r="38" fill="none" stroke="var(--bg-secondary)" strokeWidth="16" />
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="none"
              stroke="#0284c7"
              strokeWidth="16"
              strokeDasharray={`${(counterofferCount / totalActions) * 238} 238`}
            />
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="none"
              stroke="#10b981"
              strokeWidth="16"
              strokeDasharray={`${(acceptCount / totalActions) * 238} 238`}
              strokeDashoffset={-((counterofferCount / totalActions) * 238)}
            />
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="none"
              stroke="#ef4444"
              strokeWidth="16"
              strokeDasharray={`${(rejectCount / totalActions) * 238} 238`}
              strokeDashoffset={-(((counterofferCount + acceptCount) / totalActions) * 238)}
            />
          </svg>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#0284c7' }}></span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Counteroffers: <strong>{counterofferCount}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#10b981' }}></span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Accepted Deals: <strong>{acceptCount}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#ef4444' }}></span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Rejections: <strong>{rejectCount}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#f59e0b' }}></span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Opening Offers: <strong>{offerCount}</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
