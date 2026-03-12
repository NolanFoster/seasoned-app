import { useState, useRef, useEffect, useCallback } from 'react';

const AUTH_WORKER_URL = import.meta.env.VITE_AUTH_WORKER_URL;
const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 300; // 5 minutes

function OtpInput({ value, onChange, onKeyDown, inputRef, index }) {
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={1}
      value={value}
      onChange={(e) => onChange(e, index)}
      onKeyDown={(e) => onKeyDown(e, index)}
      className="auth-otp-digit"
      autoComplete="one-time-code"
      aria-label={`OTP digit ${index + 1}`}
    />
  );
}

export default function AuthModal({ onClose, onLogin }) {
  const [step, setStep] = useState('email'); // 'email' | 'otp' | 'success'
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);
  const [canResend, setCanResend] = useState(false);

  const emailInputRef = useRef(null);
  const otpRefs = useRef(Array.from({ length: OTP_LENGTH }, () => null));
  const timerRef = useRef(null);

  useEffect(() => {
    if (emailInputRef.current) emailInputRef.current.focus();
  }, []);

  useEffect(() => {
    if (step === 'otp') {
      otpRefs.current[0]?.focus();
      startCountdown();
    }
    return () => clearInterval(timerRef.current);
  }, [step]);

  const startCountdown = () => {
    setSecondsLeft(OTP_TTL_SECONDS);
    setCanResend(false);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          setCanResend(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const formatCountdown = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    if (!AUTH_WORKER_URL) {
      setError('Authentication service is not configured.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(`${AUTH_WORKER_URL}/otp/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || 'Failed to send code. Please try again.');
      }

      setStep('otp');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (e, index) => {
    const val = e.target.value.replace(/\D/g, '');
    if (!val && e.nativeEvent.inputType !== 'deleteContentBackward') return;

    // Handle paste of full code
    if (val.length > 1) {
      const digits = val.slice(0, OTP_LENGTH).split('');
      const next = [...otpDigits];
      digits.forEach((d, i) => { if (index + i < OTP_LENGTH) next[index + i] = d; });
      setOtpDigits(next);
      const lastFilled = Math.min(index + digits.length, OTP_LENGTH - 1);
      otpRefs.current[lastFilled]?.focus();
      return;
    }

    const next = [...otpDigits];
    next[index] = val;
    setOtpDigits(next);

    if (val && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    const otp = otpDigits.join('');
    if (otp.length < OTP_LENGTH) {
      setError('Please enter all 6 digits.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(`${AUTH_WORKER_URL}/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.message || body.error || 'Invalid code. Please try again.');
      }

      clearInterval(timerRef.current);
      setStep('success');

      setTimeout(() => {
        onLogin(body.token, body.user);
        onClose();
      }, 1800);
    } catch (err) {
      setError(err.message);
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    setIsLoading(true);
    setError('');
    setOtpDigits(Array(OTP_LENGTH).fill(''));

    try {
      const res = await fetch(`${AUTH_WORKER_URL}/otp/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) throw new Error('Failed to resend code.');
      startCountdown();
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="auth-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="auth-modal">
        {/* Close button */}
        <button className="auth-close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {/* Branding */}
        <div className="auth-brand">
          <img src="/spoon.svg" alt="Seasoned" className="auth-brand-icon" />
          <span className="auth-brand-name">Seasoned</span>
        </div>

        {step === 'email' && (
          <div className="auth-step auth-step-email">
            <h2 className="auth-title">Welcome back</h2>
            <p className="auth-subtitle">Sign in or create an account — we'll send a one-time code to your email.</p>

            <form onSubmit={handleEmailSubmit} className="auth-form" noValidate>
              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-email">Email address</label>
                <input
                  id="auth-email"
                  ref={emailInputRef}
                  type="email"
                  className="auth-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  disabled={isLoading}
                  autoComplete="email"
                  required
                />
              </div>

              {error && <p className="auth-error">{error}</p>}

              <button
                type="submit"
                className={`auth-submit-btn ${isLoading ? 'loading' : ''}`}
                disabled={isLoading || !email.trim()}
              >
                {isLoading ? (
                  <span className="auth-spinner" aria-hidden="true" />
                ) : (
                  'Continue with email'
                )}
              </button>
            </form>

            <p className="auth-legal">
              By continuing, you agree to Seasoned's terms of service.
            </p>
          </div>
        )}

        {step === 'otp' && (
          <div className="auth-step auth-step-otp">
            <h2 className="auth-title">Check your email</h2>
            <p className="auth-subtitle">
              We sent a 6-digit code to <strong>{email}</strong>. Enter it below — it expires in 5 minutes.
            </p>

            <form onSubmit={handleOtpSubmit} className="auth-form" noValidate>
              <div className="auth-otp-row">
                {otpDigits.map((digit, i) => (
                  <OtpInput
                    key={i}
                    index={i}
                    value={digit}
                    onChange={handleOtpChange}
                    onKeyDown={handleOtpKeyDown}
                    inputRef={(el) => { otpRefs.current[i] = el; }}
                  />
                ))}
              </div>

              {error && <p className="auth-error">{error}</p>}

              <div className="auth-countdown">
                {canResend ? (
                  <button
                    type="button"
                    className="auth-resend-btn"
                    onClick={handleResend}
                    disabled={isLoading}
                  >
                    Resend code
                  </button>
                ) : (
                  <span>Code expires in {formatCountdown(secondsLeft)}</span>
                )}
              </div>

              <button
                type="submit"
                className={`auth-submit-btn ${isLoading ? 'loading' : ''}`}
                disabled={isLoading || otpDigits.join('').length < OTP_LENGTH}
              >
                {isLoading ? (
                  <span className="auth-spinner" aria-hidden="true" />
                ) : (
                  'Verify code'
                )}
              </button>
            </form>

            <button
              type="button"
              className="auth-back-btn"
              onClick={() => { setStep('email'); setError(''); setOtpDigits(Array(OTP_LENGTH).fill('')); clearInterval(timerRef.current); }}
            >
              ← Use a different email
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="auth-step auth-step-success">
            <div className="auth-success-icon" aria-hidden="true">✓</div>
            <h2 className="auth-title">You're signed in!</h2>
            <p className="auth-subtitle">Welcome to Seasoned.</p>
          </div>
        )}
      </div>
    </div>
  );
}
