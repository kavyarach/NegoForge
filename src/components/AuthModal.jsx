import { useState, useEffect } from 'react';

export function AuthModal({ isOpen, onClose, onAuthSuccess, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode); // 'login', 'register', 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  // Mini-Game State (NegoReflex Challenge)
  const [gameActive, setGameActive] = useState(false);
  const [gameOffer, setGameOffer] = useState(130000);
  const [targetVal] = useState(85000);
  const [timeLeft, setTimeLeft] = useState(6);
  const [gameScore, setGameScore] = useState(0);
  const [gameStatus, setGameStatus] = useState('idle'); // 'idle', 'playing', 'won', 'accepted', 'timeout'

  // Reset game state when modal opens or closes
  useEffect(() => {
    if (!isOpen) {
      setGameActive(false);
      setGameStatus('idle');
      setGameOffer(130000);
      setTimeLeft(6);
    }
  }, [isOpen]);

  useEffect(() => {
    let timer;
    if (gameActive && gameStatus === 'playing' && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (gameActive && gameStatus === 'playing' && timeLeft === 0) {
      setGameStatus('timeout');
    }
    return () => clearTimeout(timer);
  }, [gameActive, gameStatus, timeLeft]);

  if (!isOpen) return null;

  const handleStartGame = () => {
    setGameOffer(130000);
    setTimeLeft(6);
    setGameStatus('playing');
    setGameActive(true);
  };

  const handleGameMove = (type) => {
    if (gameStatus !== 'playing') return;

    let newOffer = gameOffer;
    if (type === 'counter') {
      newOffer = Math.max(targetVal, gameOffer - 15000);
    } else if (type === 'midpoint') {
      newOffer = Math.max(targetVal, Math.round((gameOffer + targetVal) / 2));
    } else if (type === 'accept') {
      // Accepting at current offer value
      setGameOffer(gameOffer);
      setGameStatus('accepted');
      setGameScore((prev) => prev + (gameOffer <= targetVal + 10000 ? 500 : 300));
      return;
    }

    setGameOffer(newOffer);
    if (newOffer <= targetVal) {
      setGameStatus('won');
      setGameScore((prev) => prev + 500);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || 'Unable to sign in. Please check your credentials and try again.');
        }

        localStorage.setItem('negoforge_auth_token', data.token);
        localStorage.setItem('negoforge_user', JSON.stringify(data.user));
        onAuthSuccess(data.user);
        onClose();
      } else if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || 'Unable to create your account. Please try again.');
        }

        localStorage.setItem('negoforge_auth_token', data.token);
        localStorage.setItem('negoforge_user', JSON.stringify(data.user));
        onAuthSuccess(data.user);
        onClose();
      } else if (mode === 'forgot') {
        try {
          const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          if (res.ok) {
            const data = await res.json();
            setMessage(data.message || 'Password reset link sent to your email.');
          } else {
            setMessage('Password reset instructions sent to your email address.');
          }
        } catch (_err) {
          setMessage('Password reset instructions sent to your email address.');
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to complete request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const showGamePrompt = email.length > 3 && password.length >= 4;

  return (
    <div className="modal-backdrop" style={backdropStyle}>
      <div className="modal-content" style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-primary, #f1f5f9)' }}>
            {mode === 'login' ? 'Sign In to NegoForge' : mode === 'register' ? 'Create Your Account' : 'Reset Password'}
          </h2>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {error && <div style={errorStyle}>⚠️ {error}</div>}
        {message && <div style={successStyle}>✅ {message}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Full Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Alex Morgan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Email Address *</label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </div>

          {mode !== 'forgot' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Password *</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          {/* Interactive Bargaining Warmup Mini Game */}
          {mode !== 'forgot' && showGamePrompt && (
            <div style={{ background: 'var(--bg-secondary, #1e293b)', padding: '14px', borderRadius: '10px', marginBottom: '16px', border: '1px solid var(--primary-brand, #0284c7)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8' }}>
                  🎮 Quick Bargaining Challenge (Optional Bonus XP)
                </span>
                {gameScore > 0 && (
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#10b981' }}>
                    Score: +{gameScore} XP
                  </span>
                )}
              </div>

              {!gameActive || gameStatus === 'idle' ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)' }}>
                    Bargain AI offer from ₹130,000 down to target!
                  </span>
                  <button
                    type="button"
                    onClick={handleStartGame}
                    style={{ padding: '6px 12px', borderRadius: '6px', background: '#38bdf8', color: '#0f172a', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    ▶ Play Mini Game
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.85rem' }}>
                    <span>Offer: <strong style={{ color: '#38bdf8' }}>₹{gameOffer.toLocaleString()}</strong></span>
                    <span>Target: <strong style={{ color: '#10b981' }}>₹{targetVal.toLocaleString()}</strong></span>
                    <span style={{ fontWeight: 800, color: timeLeft <= 2 ? '#ef4444' : '#f59e0b' }}>⏱ {timeLeft}s</span>
                  </div>

                  {gameStatus === 'playing' && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleGameMove('counter')}
                        style={{ flex: 1, padding: '6px', borderRadius: '6px', background: '#7c3aed', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        🎯 Counter (-15k)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGameMove('midpoint')}
                        style={{ flex: 1, padding: '6px', borderRadius: '6px', background: '#0284c7', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        ⚖️ Midpoint
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGameMove('accept')}
                        style={{ flex: 1, padding: '6px', borderRadius: '6px', background: '#10b981', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        🤝 Accept Deal
                      </button>
                    </div>
                  )}

                  {(gameStatus === 'won' || gameStatus === 'accepted') && (
                    <div style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 800, textAlign: 'center', marginTop: '6px' }}>
                      🎉 Deal Settled at ₹{gameOffer.toLocaleString()}! (+{gameStatus === 'won' ? '500' : '300'} Bargaining XP)
                    </div>
                  )}

                  {gameStatus === 'timeout' && (
                    <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 800, textAlign: 'center', marginTop: '6px' }}>
                      ⌛ Time Expired! Click Play to try again.
                      <button type="button" onClick={handleStartGame} style={{ marginLeft: '8px', background: 'none', border: 'underline', color: '#38bdf8', cursor: 'pointer' }}>Retry</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <button type="submit" disabled={loading} style={submitBtnStyle}>
            {loading ? 'Processing...' : mode === 'login' ? 'Sign In & Enter Workspace →' : mode === 'register' ? 'Create Account & Enter →' : 'Send Reset Link'}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '0.85rem', color: '#a8b3c7' }}>
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button onClick={() => { setMode('register'); setError(null); }} style={linkBtnStyle}>Register</button>
              {' · '}
              <button onClick={() => { setMode('forgot'); setError(null); }} style={linkBtnStyle}>Forgot password?</button>
            </>
          ) : mode === 'register' ? (
            <>
              Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(null); }} style={linkBtnStyle}>Sign In</button>
            </>
          ) : (
            <button onClick={() => { setMode('login'); setError(null); }} style={linkBtnStyle}>Back to Sign In</button>
          )}
        </div>
      </div>
    </div>
  );
}

const backdropStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '20px',
};
const modalStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px',
  padding: '28px', maxWidth: '460px', width: '100%', color: 'var(--text-primary)', boxShadow: 'var(--shadow-lg)',
};
const closeBtnStyle = { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer' };
const labelStyle = { display: 'block', fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 700 };
const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: '8px', background: 'var(--bg-input)',
  border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none', boxSizing: 'border-box',
};
const submitBtnStyle = {
  width: '100%', padding: '13px', borderRadius: '8px', background: 'var(--primary-brand)',
  border: 'none', color: '#ffffff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
};
const errorStyle = { background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger-color)', color: 'var(--danger-color)', padding: '12px', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '14px' };
const successStyle = { background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success-color)', color: 'var(--success-color)', padding: '12px', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '14px' };
const linkBtnStyle = { background: 'none', border: 'none', color: 'var(--primary-brand)', cursor: 'pointer', fontWeight: 700, padding: 0, fontSize: '0.9rem' };
