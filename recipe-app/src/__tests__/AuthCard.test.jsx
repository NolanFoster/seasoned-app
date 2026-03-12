import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import AuthCard from '../AuthCard'

function renderAuthCard(overrides = {}) {
  const props = {
    mode: 'signin',
    step: 'email',
    email: 'cook@example.com',
    otp: '',
    busy: false,
    error: '',
    message: '',
    onModeChange: jest.fn(),
    onEmailChange: jest.fn(),
    onOtpChange: jest.fn(),
    onRequestCode: jest.fn((e) => e.preventDefault()),
    onVerifyCode: jest.fn((e) => e.preventDefault()),
    onBackToEmail: jest.fn(),
    onResendCode: jest.fn(),
    ...overrides,
  }
  render(<AuthCard {...props} />)
  return props
}

describe('AuthCard', () => {
  test('shows sign in form by default', () => {
    renderAuthCard()

    expect(screen.getByText('Sign in')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send sign in code/i })).toBeInTheDocument()
  })

  test('switches mode with tabs', () => {
    const props = renderAuthCard()
    fireEvent.click(screen.getByRole('tab', { name: /Sign up/i }))
    expect(props.onModeChange).toHaveBeenCalledWith('signup')
  })

  test('submits email step form', () => {
    const props = renderAuthCard()
    fireEvent.click(screen.getByRole('button', { name: /Send sign in code/i }))
    expect(props.onRequestCode).toHaveBeenCalled()
  })

  test('shows otp step actions and submits verification', () => {
    const props = renderAuthCard({ step: 'otp', otp: '123456' })

    expect(screen.getByLabelText('Verification code')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Verify and continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /Change email/i }))
    fireEvent.click(screen.getByRole('button', { name: /Resend code/i }))

    expect(props.onVerifyCode).toHaveBeenCalled()
    expect(props.onBackToEmail).toHaveBeenCalled()
    expect(props.onResendCode).toHaveBeenCalled()
  })
})
