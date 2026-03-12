import React from 'react'

export default function AuthCard({
  mode,
  step,
  email,
  otp,
  busy,
  error,
  message,
  onModeChange,
  onEmailChange,
  onOtpChange,
  onRequestCode,
  onVerifyCode,
  onBackToEmail,
  onResendCode,
}) {
  const isSignUp = mode === 'signup'

  return (
    <div className="auth-card">
      <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          role="tab"
          aria-selected={!isSignUp}
          className={`auth-tab ${!isSignUp ? 'active' : ''}`}
          onClick={() => onModeChange('signin')}
          disabled={busy}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isSignUp}
          className={`auth-tab ${isSignUp ? 'active' : ''}`}
          onClick={() => onModeChange('signup')}
          disabled={busy}
        >
          Sign up
        </button>
      </div>

      <h1 className="auth-title">{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
      <p className="auth-subtitle">
        {isSignUp
          ? 'Use your email to get a one-time verification code.'
          : 'Sign in with your email and one-time verification code.'}
      </p>

      {step === 'email' ? (
        <form className="auth-form" onSubmit={onRequestCode}>
          <label className="auth-label" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            className="auth-input"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            disabled={busy}
          />
          <button type="submit" className="auth-submit-btn" disabled={busy}>
            {busy ? 'Sending…' : isSignUp ? 'Send sign up code' : 'Send sign in code'}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={onVerifyCode}>
          <label className="auth-label" htmlFor="auth-otp">Verification code</label>
          <input
            id="auth-otp"
            className="auth-input auth-input-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            value={otp}
            onChange={(e) => onOtpChange(e.target.value)}
            placeholder="123456"
            autoComplete="one-time-code"
            required
            disabled={busy}
          />
          <button type="submit" className="auth-submit-btn" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify and continue'}
          </button>
          <div className="auth-secondary-actions">
            <button type="button" className="auth-link-btn" onClick={onBackToEmail} disabled={busy}>
              Change email
            </button>
            <button type="button" className="auth-link-btn" onClick={onResendCode} disabled={busy}>
              Resend code
            </button>
          </div>
        </form>
      )}

      {error && <p className="auth-error">{error}</p>}
      {message && !error && <p className="auth-message">{message}</p>}
    </div>
  )
}
