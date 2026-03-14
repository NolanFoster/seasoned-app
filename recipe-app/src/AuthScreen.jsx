import React, { useState, useRef, useEffect } from 'react'

const OTP_LENGTH = 6

export default function AuthScreen({ onRequestOTP, onVerifyOTP }) {
  const [step, setStep] = useState('email') // 'email' | 'otp'
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''))
  const [status, setStatus] = useState('idle') // idle | loading | error | success
  const [errorMsg, setErrorMsg] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  const emailInputRef = useRef(null)
  const otpRefs = useRef([])

  useEffect(() => {
    emailInputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (step === 'otp') otpRefs.current[0]?.focus()
  }, [step])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  function isValidEmail(val) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
  }

  async function handleEmailSubmit(e) {
    e.preventDefault()
    if (!isValidEmail(email)) {
      setErrorMsg('Please enter a valid email address')
      setStatus('error')
      return
    }
    setStatus('loading')
    setErrorMsg('')
    try {
      await onRequestOTP(email)
      setStep('otp')
      setStatus('idle')
      setResendCooldown(30)
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  function handleOtpChange(index, value) {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, OTP_LENGTH).split('')
      const next = [...otp]
      pasted.forEach((ch, i) => {
        if (index + i < OTP_LENGTH) next[index + i] = ch
      })
      setOtp(next)
      const focusIdx = Math.min(index + pasted.length, OTP_LENGTH - 1)
      otpRefs.current[focusIdx]?.focus()
      if (next.every((d) => d !== '')) submitOtp(next)
      return
    }
    const digit = value.replace(/\D/g, '')
    const next = [...otp]
    next[index] = digit
    setOtp(next)
    setErrorMsg('')
    setStatus('idle')
    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus()
    if (next.every((d) => d !== '')) submitOtp(next)
  }

  function handleOtpKeyDown(index, e) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  async function submitOtp(digits) {
    const code = digits.join('')
    if (code.length !== OTP_LENGTH) return
    setStatus('loading')
    setErrorMsg('')
    try {
      await onVerifyOTP(email, code)
      setStatus('success')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
      setOtp(Array(OTP_LENGTH).fill(''))
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setStatus('loading')
    setErrorMsg('')
    try {
      await onRequestOTP(email)
      setResendCooldown(30)
      setStatus('idle')
      setOtp(Array(OTP_LENGTH).fill(''))
      otpRefs.current[0]?.focus()
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  function handleBack() {
    setStep('email')
    setOtp(Array(OTP_LENGTH).fill(''))
    setErrorMsg('')
    setStatus('idle')
    setTimeout(() => emailInputRef.current?.focus(), 50)
  }

  const isLoading = status === 'loading'

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <svg className="auth-brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/>
            <path d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4"/>
            <path d="M12 8v1M12 15v1M8.5 9.5l.7.7M14.8 14.8l.7.7M8 12H7M17 12h-1M8.5 14.5l.7-.7M14.8 9.2l.7-.7"/>
          </svg>
          <span className="auth-brand-name">Seasoned</span>
        </div>

        {step === 'email' ? (
          <>
            <h1 className="auth-title">Welcome</h1>
            <p className="auth-subtitle">
              Sign in or create an account to get started.
              We'll send a verification code to your email.
            </p>

            <form className="auth-form" onSubmit={handleEmailSubmit} noValidate>
              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-email">Email address</label>
                <input
                  ref={emailInputRef}
                  id="auth-email"
                  className={`auth-input ${status === 'error' ? 'auth-input--error' : ''}`}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); setStatus('idle') }}
                  disabled={isLoading}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {status === 'error' && errorMsg && (
                <p className="auth-error">{errorMsg}</p>
              )}

              <button
                className="auth-submit"
                type="submit"
                disabled={isLoading || !email.trim()}
              >
                {isLoading ? (
                  <span className="auth-spinner-wrap">
                    <svg className="auth-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                    Sending code…
                  </span>
                ) : 'Continue'}
              </button>
            </form>
          </>
        ) : (
          <>
            <button className="auth-back" onClick={handleBack} disabled={isLoading} type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back
            </button>

            <h1 className="auth-title">Check your email</h1>
            <p className="auth-subtitle">
              We sent a {OTP_LENGTH}-digit code to <strong>{email}</strong>
            </p>

            <div className="auth-otp-group" role="group" aria-label="Verification code">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (otpRefs.current[i] = el)}
                  className={`auth-otp-input ${status === 'error' ? 'auth-otp-input--error' : ''} ${status === 'success' ? 'auth-otp-input--success' : ''}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={OTP_LENGTH}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  disabled={isLoading || status === 'success'}
                  aria-label={`Digit ${i + 1}`}
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            {isLoading && (
              <p className="auth-status">
                <svg className="auth-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
                Verifying…
              </p>
            )}

            {status === 'success' && (
              <p className="auth-success">Verified! Signing you in…</p>
            )}

            {status === 'error' && errorMsg && (
              <p className="auth-error">{errorMsg}</p>
            )}

            <div className="auth-resend">
              <span className="auth-resend-text">Didn't get the code?</span>
              <button
                className="auth-resend-btn"
                onClick={handleResend}
                disabled={isLoading || resendCooldown > 0}
                type="button"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
