import { useState, useRef, useEffect } from 'react';

const PRESET_TOPICS = [
  {
    id: 'counteroffer',
    label: '💡 Counteroffer Strategy',
    question: 'How should I structure an effective counteroffer?',
    response: `### 💡 Strategic Counteroffer Guidelines

1. **Calculate Your Target vs. Reservation Price**:
   - Never counter at your absolute bottom line immediately. Leave a 15–20% buffer for gradual concessions.

2. **Always Pair Price with Justification**:
   - State the value drivers behind your number (e.g., SLA guarantees, payment terms, volume discounts, support tier).
   - *Example Script*: "We can adjust our pricing to $88,000 provided we commit to a 2-year term with quarterly invoicing."

3. **Control the Concession Pace**:
   - Make decreasing concessions across rounds (e.g., -$5,000 in Round 1, -$2,000 in Round 2, -$500 in Round 3) to signal your firm boundary.`,
  },
  {
    id: 'deadlock',
    label: '🛡️ Resolving Deadlocks',
    question: 'What tactics can break a deadlock or pricing stall?',
    response: `### 🛡️ Deadlock Resolution Tactics

1. **Unbundle Single Issues into Packages**:
   - If you are stuck on price alone, introduce non-monetary trade-offs (payment terms, delivery speed, extended warranties, free training).

2. **Propose a Midpoint Split**:
   - Calculate the midpoint between current offers and suggest splitting the gap conditionally on an accelerated closing date.

3. **Reframe the BATNA (Best Alternative)**:
   - Politely remind the counterpart of the unique switching costs or value differentiator your solution provides compared to walking away.`,
  },
  {
    id: 'batna',
    label: '⚖️ BATNA & ZOPA Advice',
    question: 'How do I determine BATNA and ZOPA for my negotiation?',
    response: `### ⚖️ BATNA & ZOPA Analysis

- **BATNA (Best Alternative to a Negotiated Agreement)**:
  - Identify your best alternative outcome if this deal fails. If your BATNA is strong, you can negotiate with higher firmness.

- **ZOPA (Zone of Possible Agreement)**:
  - ZOPA exists when the buyer's maximum willingness to pay overlaps with the seller's minimum acceptable price.
  - *Example*: If Buyer ceiling is $95,000 and Seller floor is $80,000, the ZOPA is $80,000 – $95,000. Target the upper half of the ZOPA!`,
  },
  {
    id: 'anchoring',
    label: '🎯 Price Anchoring Tactics',
    question: 'How does price anchoring work and how do I anchor effectively?',
    response: `### 🎯 Price Anchoring Framework

1. **First-Mover Advantage**:
   - The first offer establishes a cognitive anchor. If you open first, anchor ambitiously yet realistically based on market data.

2. **Countering a Lowball Anchor**:
   - Never accept an aggressive anchor as the starting baseline. Immediately re-anchor with a clear rationale or ask the opponent to explain their breakdown.`,
  },
];

export function NegotiationChatbot({ activeState }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: 'Hello! 👋 I am your **AI Negotiation Advisor**. Ask me for strategic recommendations, tactics, counteroffer formulas, or advice on your current negotiation!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const chatEndRef = useRef(null);

  useEffect(() => {
    if (isOpen && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isTyping]);

  const generateRecommendation = (query) => {
    const qLower = query.toLowerCase();

    // Contextual checks if active negotiation session exists
    let contextHeader = '';
    if (activeState && activeState.scenario) {
      const scenario = activeState.scenario.title;
      const round = activeState.currentRound || 1;
      const offerVal = activeState.currentOffer?.value;
      const curr = activeState.scenario?.currencySymbol || '$';
      contextHeader = `*Recommendation for Active Session (${scenario} — Round ${round})*:\n\n`;
      if (offerVal) {
        contextHeader += `> Current Offer on Table: **${curr}${offerVal.toLocaleString()}**\n\n`;
      }
    }

    if (qLower.includes('counter') || qLower.includes('offer') || qLower.includes('price') || qLower.includes('discount')) {
      return (
        contextHeader +
        `### 💡 Recommended Counteroffer Strategy

1. **Value-Add Countering**:
   - Instead of dropping price unconditionally, ask for an extended term, larger order volume, or flexible delivery schedule in exchange.
2. **Concession Signalling**:
   - Offer a specific, non-round number (e.g., $86,400 instead of $85,000) to signal precise cost calculations.
3. **Persuasive Script**:
   - *"We can adjust the contract amount provided we finalize the scope items today."*`
      );
    }

    if (qLower.includes('deadlock') || qLower.includes('stuck') || qLower.includes('reject') || qLower.includes('walk')) {
      return (
        contextHeader +
        `### 🛡️ Recommended Deadlock Resolution Plan

1. **Pause & Reframe**:
   - Take a brief pause to review non-price terms (payment cadence, implementation timelines, warranty duration).
2. **Package Deal Proposal**:
   - Present two distinct options simultaneously (Option A: Higher price + free add-ons vs Option B: Lower price + standard terms).
3. **Conditional Split**:
   - Propose splitting the remaining gap 50/50 conditionally on immediate sign-off.`
      );
    }

    if (qLower.includes('salary') || qLower.includes('job') || qLower.includes('pay') || qLower.includes('bonus')) {
      return (
        `### 💼 Job Offer Negotiation Recommendations

1. **Evaluate Total Compensation**:
   - Consider base salary, signing bonus, performance bonuses, stock options, PTO, and remote work flexibility.
2. **Anchor Ambitiously**:
   - Request 10–15% above the initial offer while citing industry salary benchmarks and specialized skill sets.
3. **Persuasive Script**:
   - *"I am extremely excited about the role. Based on current industry benchmarks for this position, I would be ready to accept today at $115,000."*`
      );
    }

    return (
      contextHeader +
      `### 🤖 Strategic Negotiation Recommendations

1. **Focus on Interests, Not Positions**:
   - Discover why the counterpart wants a specific term rather than arguing over rigid numbers.
2. **Create Multi-Issue Bundles**:
   - Combine price, delivery timelines, payment cadence, and service level agreements (SLAs) into a single win-win offer.
3. **Maintain Emotional Control**:
   - Keep a respectful, collaborative tone. Hard bargaining on principles works best when paired with personal warmth.`
    );
  };

  const handleSendMessage = (textToSend) => {
    const text = textToSend || inputQuery;
    if (!text.trim()) return;

    const userMsg = {
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputQuery('');
    setIsTyping(true);

    setTimeout(() => {
      const responseText = generateRecommendation(text);
      const botMsg = {
        sender: 'bot',
        text: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 800);
  };

  const handleTopicClick = (topic) => {
    const userMsg = {
      sender: 'user',
      text: topic.question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    setTimeout(() => {
      const botMsg = {
        sender: 'bot',
        text: topic.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 600);
  };

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 4000 }}>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 22px',
            borderRadius: '30px',
            background: 'var(--primary-brand, #0284c7)',
            color: '#ffffff',
            border: 'none',
            fontWeight: 800,
            fontSize: '0.95rem',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(2, 132, 199, 0.35)',
            transition: 'transform 0.2s ease',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>💬</span>
          <span>AI Negotiation Assistant</span>
        </button>
      )}

      {/* Chatbot Window */}
      {isOpen && (
        <div
          style={{
            width: '380px',
            maxWidth: 'calc(100vw - 32px)',
            height: '540px',
            maxHeight: 'calc(100vh - 100px)',
            background: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-color, #cbd5e1)',
            borderRadius: '20px',
            boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(15, 23, 42, 0.15))',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Chatbot Header */}
          <div
            style={{
              padding: '16px 20px',
              background: 'var(--primary-brand, #0284c7)',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '1.1rem',
                }}
              >
                🤖
              </div>
              <div>
                <strong style={{ display: 'block', fontSize: '1rem', fontWeight: 800 }}>
                  AI Negotiation Advisor
                </strong>
                <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                  Real-time Strategy & Recommendations
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#ffffff',
                fontSize: '1.4rem',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>

          {/* Quick Recommendation Topics Bar */}
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--bg-secondary, #f1f5f9)',
              borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {PRESET_TOPICS.map((topic) => (
              <button
                key={topic.id}
                onClick={() => handleTopicClick(topic)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '14px',
                  background: 'var(--bg-card, #ffffff)',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  color: 'var(--primary-brand, #0284c7)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  flex: '0 0 auto',
                }}
              >
                {topic.label}
              </button>
            ))}
          </div>

          {/* Chat Log Message Container */}
          <div
            style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              background: 'var(--bg-main, #f8fafc)',
            }}
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '12px 16px',
                    borderRadius: '14px',
                    background:
                      msg.sender === 'user'
                        ? 'var(--primary-brand, #0284c7)'
                        : 'var(--bg-card, #ffffff)',
                    color: msg.sender === 'user' ? '#ffffff' : 'var(--text-primary, #0f172a)',
                    border:
                      msg.sender === 'user'
                        ? 'none'
                        : '1px solid var(--border-color, #cbd5e1)',
                    boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
                    fontSize: '0.9rem',
                    lineHeight: '1.5',
                  }}
                >
                  {msg.text.split('\n').map((line, lIdx) => {
                    if (line.startsWith('### ')) {
                      return (
                        <h4
                          key={lIdx}
                          style={{
                            margin: '4px 0 8px 0',
                            fontSize: '0.95rem',
                            fontWeight: 800,
                            color: msg.sender === 'user' ? '#ffffff' : 'var(--primary-brand, #0284c7)',
                          }}
                        >
                          {line.replace('### ', '')}
                        </h4>
                      );
                    }
                    if (line.startsWith('> ')) {
                      return (
                        <div
                          key={lIdx}
                          style={{
                            padding: '6px 10px',
                            background: 'var(--bg-secondary, #f1f5f9)',
                            borderLeft: '3px solid var(--primary-brand, #0284c7)',
                            margin: '6px 0',
                            fontSize: '0.85rem',
                            borderRadius: '4px',
                          }}
                        >
                          {line.replace('> ', '')}
                        </div>
                      );
                    }
                    return <div key={lIdx}>{line}</div>;
                  })}
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--text-muted, #64748b)',
                    marginTop: '4px',
                    padding: '0 4px',
                  }}
                >
                  {msg.timestamp}
                </span>
              </div>
            ))}

            {isTyping && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                <span className="pulsing-indicator cyan" />
                <span style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                  Formulating recommendation...
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            style={{
              padding: '12px 14px',
              background: 'var(--bg-card, #ffffff)',
              borderTop: '1px solid var(--border-color, #cbd5e1)',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              placeholder="Ask for negotiation recommendations..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'var(--bg-input, #ffffff)',
                border: '1px solid var(--border-color, #cbd5e1)',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!inputQuery.trim()}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                background: inputQuery.trim() ? 'var(--primary-brand, #0284c7)' : 'var(--bg-secondary)',
                color: inputQuery.trim() ? '#ffffff' : 'var(--text-muted)',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: inputQuery.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
