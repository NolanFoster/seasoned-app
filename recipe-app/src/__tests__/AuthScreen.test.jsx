import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthScreen from '../AuthScreen';

function setup(overrides = {}) {
  const onRequestOTP = jest.fn(() => Promise.resolve({ success: true }));
  const onVerifyOTP = jest.fn(() => Promise.resolve({ success: true, token: 'jwt', user: { id: '1', email: 'a@b.com' } }));
  const utils = render(
    <AuthScreen
      onRequestOTP={overrides.onRequestOTP || onRequestOTP}
      onVerifyOTP={overrides.onVerifyOTP || onVerifyOTP}
      onSignInWithPasskey={overrides.onSignInWithPasskey}
    />
  );
  return { onRequestOTP, onVerifyOTP, ...utils };
}

describe('AuthScreen — email step', () => {
  test('renders email input and continue button', () => {
    setup();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  test('shows brand heading', () => {
    setup();
    expect(screen.getByText('Seasoned')).toBeInTheDocument();
    expect(screen.getByText('Welcome')).toBeInTheDocument();
  });

  test('continue button is disabled when email is empty', () => {
    setup();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  test('shows validation error for invalid email', async () => {
    setup();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'notanemail' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
  });

  test('calls onRequestOTP with the entered email', async () => {
    const { onRequestOTP } = setup();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(onRequestOTP).toHaveBeenCalledWith('user@example.com'));
  });

  test('shows OTP step after successful email submission', async () => {
    setup();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });

  test('shows error when OTP request fails', async () => {
    const failingRequest = jest.fn(() => Promise.reject(new Error('Rate limited')));
    setup({ onRequestOTP: failingRequest });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/rate limited/i)).toBeInTheDocument();
  });
});


describe('AuthScreen — passkey sign-in', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'PublicKeyCredential', { value: function PublicKeyCredential() {}, configurable: true })
    Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true })
  })

  test('shows passkey action when the browser supports WebAuthn', () => {
    setup({ onSignInWithPasskey: jest.fn(() => Promise.resolve({ success: true })) })
    expect(screen.getByRole('button', { name: /use a passkey/i })).toBeEnabled()
  })

  test('signs in with no email so the authenticator can offer a discoverable passkey', async () => {
    const onSignInWithPasskey = jest.fn(() => Promise.resolve({ success: true }))
    setup({ onSignInWithPasskey })
    fireEvent.click(screen.getByRole('button', { name: /use a passkey/i }))
    await waitFor(() => expect(onSignInWithPasskey).toHaveBeenCalledWith(undefined))
  })

  test('omits a half-typed address rather than sending an invalid one', async () => {
    const onSignInWithPasskey = jest.fn(() => Promise.resolve({ success: true }))
    setup({ onSignInWithPasskey })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'user@' } })
    fireEvent.click(screen.getByRole('button', { name: /use a passkey/i }))
    await waitFor(() => expect(onSignInWithPasskey).toHaveBeenCalledWith(undefined))
  })

  test('calls passkey sign-in with the entered email', async () => {
    const onSignInWithPasskey = jest.fn(() => Promise.resolve({ success: true }))
    setup({ onSignInWithPasskey })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'User@Example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /use a passkey/i }))
    await waitFor(() => expect(onSignInWithPasskey).toHaveBeenCalledWith('User@Example.com'))
  })

  test('shows a cancellation error without losing the email fallback', async () => {
    const onSignInWithPasskey = jest.fn(() => Promise.reject(new Error('Passkey sign-in was cancelled')))
    setup({ onSignInWithPasskey })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /use a passkey/i }))
    expect(await screen.findByText(/cancelled/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument()
  })
})

describe('AuthScreen — OTP step', () => {
  async function goToOtpStep(overrides = {}) {
    const result = setup(overrides);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByText(/check your email/i);
    return result;
  }

  test('renders 6 OTP digit inputs', async () => {
    await goToOtpStep();
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(6);
  });

  test('displays the email address the code was sent to', async () => {
    await goToOtpStep();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  test('entering all digits calls onVerifyOTP', async () => {
    const { onVerifyOTP } = await goToOtpStep();
    const inputs = screen.getAllByRole('textbox');
    '123456'.split('').forEach((d, i) => {
      fireEvent.change(inputs[i], { target: { value: d } });
    });
    await waitFor(() => expect(onVerifyOTP).toHaveBeenCalledWith('user@example.com', '123456'));
  });

  test('shows error when verification fails', async () => {
    const failingVerify = jest.fn(() => Promise.reject(new Error('Invalid code')));
    await goToOtpStep({ onVerifyOTP: failingVerify });
    const inputs = screen.getAllByRole('textbox');
    '123456'.split('').forEach((d, i) => {
      fireEvent.change(inputs[i], { target: { value: d } });
    });
    expect(await screen.findByText(/invalid code/i)).toBeInTheDocument();
  });

  test('back button returns to email step', async () => {
    await goToOtpStep();
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  test('resend button shows cooldown countdown', async () => {
    await goToOtpStep();
    expect(screen.getByText(/resend in/i)).toBeInTheDocument();
  });

  test('pasting a full code fills all inputs and submits', async () => {
    const { onVerifyOTP } = await goToOtpStep();
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: '654321' } });
    await waitFor(() => expect(onVerifyOTP).toHaveBeenCalledWith('user@example.com', '654321'));
  });

  test('backspace on empty input moves focus to previous input', async () => {
    await goToOtpStep();
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: '1' } });
    // Focus should move to input 1; backspace on input 1 when empty should go back
    fireEvent.keyDown(inputs[1], { key: 'Backspace' });
    expect(document.activeElement).toBe(inputs[0]);
  });

  test('shows success message after successful verification', async () => {
    await goToOtpStep();
    const inputs = screen.getAllByRole('textbox');
    '123456'.split('').forEach((d, i) => {
      fireEvent.change(inputs[i], { target: { value: d } });
    });
    expect(await screen.findByText(/verified/i)).toBeInTheDocument();
  });
});
