import { EmailMessage } from 'cloudflare:email';
import { Env } from '../types/env';

export interface EmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class EmailService {
  private readonly sendEmailBinding: Env['send_email'];
  private readonly fromEmail: string;

  constructor(env: Env) {
    if (!env.send_email || typeof env.send_email.send !== 'function') {
      throw new Error('Cloudflare send_email binding not configured');
    }

    this.sendEmailBinding = env.send_email;
    this.fromEmail = env.FROM_EMAIL || 'noreply@yourdomain.com';
  }

  /**
   * Send an email using Cloudflare Email Workers send_email binding.
   */
  async sendEmail(options: EmailOptions): Promise<SendEmailResult> {
    try {
      const { to, subject, htmlBody, textBody } = options;

      if (!to || !subject || !htmlBody) {
        return {
          success: false,
          error: 'Missing required email parameters'
        };
      }

      const messageId = this.generateMessageId();
      const rawMessage = this.buildRawMimeMessage({
        to,
        subject,
        htmlBody,
        textBody,
        messageId
      });
      const emailMessage = new EmailMessage(this.fromEmail, to, rawMessage);
      await this.sendEmailBinding.send(emailMessage);

      return {
        success: true,
        messageId
      };
    } catch (error) {
      console.error('Error sending email:', error);

      if (error instanceof Error) {
        return {
          success: false,
          error: `Email send error: ${error.message}`
        };
      }

      return {
        success: false,
        error: 'Unknown error occurred while sending email'
      };
    }
  }

  /**
   * Send a verification email with OTP.
   */
  async sendVerificationEmail(to: string, otp: string, otpExpiryMinutes: number = 10): Promise<SendEmailResult> {
    const subject = 'Seasoned - Verify Your Email Address';
    const htmlBody = this.generateVerificationEmailHTML(to, otp, otpExpiryMinutes);
    const textBody = this.generateVerificationEmailText(to, otp, otpExpiryMinutes);

    return this.sendEmail({
      to,
      subject,
      htmlBody,
      textBody
    });
  }

  private generateMessageId(): string {
    const fromDomain = this.getFromAddressDomain();
    return `<cf-email-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@${fromDomain}>`;
  }

  private getFromAddressDomain(): string {
    const emailMatch = this.fromEmail.match(/<?([^\s<>@]+@[^\s<>@]+)>?/);
    if (!emailMatch) {
      return 'workers.dev';
    }

    const [, address] = emailMatch;
    const domain = address.split('@')[1];
    return domain || 'workers.dev';
  }

  private buildRawMimeMessage(options: EmailOptions & { messageId: string }): string {
    const { to, subject, htmlBody, textBody, messageId } = options;
    const boundary = `cf-boundary-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const plainTextBody = this.normalizeLineEndings(textBody || this.stripHtml(htmlBody));
    const normalizedHtmlBody = this.normalizeLineEndings(htmlBody);

    return [
      `From: ${this.fromEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Message-ID: ${messageId}`,
      'MIME-Version: 1.0',
      `Date: ${new Date().toUTCString()}`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      plainTextBody,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      normalizedHtmlBody,
      '',
      `--${boundary}--`,
      ''
    ].join('\r\n');
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private normalizeLineEndings(value: string): string {
    return value.replace(/\r?\n/g, '\r\n');
  }

  /**
   * Generate HTML version of verification email.
   */
  private generateVerificationEmailHTML(email: string, otp: string, expiryMinutes: number): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Seasoned - Email Verification</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            background-color: #0d1a0f;
            color: #e8f0e4;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
          }
          .wrapper {
            padding: 28px 14px;
          }
          .container {
            max-width: 620px;
            margin: 0 auto;
            background: #142016;
            border: 1px solid #2a3d2c;
            border-radius: 14px;
            overflow: hidden;
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
          }
          .header {
            padding: 34px 24px 24px;
            text-align: center;
            border-bottom: 1px solid #2a3d2c;
            background:
              radial-gradient(ellipse 70% 65% at 50% -35%, rgba(91, 184, 122, 0.16) 0%, rgba(91, 184, 122, 0) 72%),
              #142016;
          }
          .logo {
            width: 56px;
            height: 56px;
            margin: 0 auto 14px;
            border-radius: 50%;
            background: #1b2c1d;
            border: 1px solid #2a3d2c;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .logo svg {
            width: 28px;
            height: 28px;
            fill: #c8a96e;
          }
          .app-name {
            margin: 0;
            font-size: 32px;
            font-weight: 700;
            letter-spacing: -0.02em;
            color: #e8f0e4;
          }
          .tagline {
            margin: 8px 0 0;
            color: #7a9b80;
            font-size: 14px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }
          .content {
            padding: 28px 24px 14px;
          }
          .greeting {
            margin: 0 0 14px;
            color: #e8f0e4;
            font-size: 20px;
          }
          p {
            margin: 0 0 14px;
            color: #c8d5c6;
          }
          .email-highlight {
            color: #c8a96e;
            font-weight: 600;
          }
          .otp-section {
            margin: 24px 0;
          }
          .otp-box {
            border-radius: 10px;
            background: #1b2c1d;
            border: 1px solid rgba(200, 169, 110, 0.5);
            padding: 24px 18px;
            text-align: center;
          }
          .otp-code {
            margin: 0;
            font-size: 42px;
            line-height: 1;
            letter-spacing: 8px;
            font-weight: 700;
            color: #c8a96e;
            font-variant-numeric: tabular-nums;
          }
          .otp-label {
            margin: 12px 0 0;
            color: #7a9b80;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .warning {
            margin: 22px 0 0;
            padding: 14px 14px;
            border-radius: 10px;
            border: 1px solid rgba(217, 79, 79, 0.5);
            background: rgba(217, 79, 79, 0.1);
            color: #f6cfcb;
            font-size: 14px;
          }
          .warning strong {
            color: #ffb1a8;
          }
          .signature {
            margin: 24px 0 0;
            color: #c8d5c6;
          }
          .signature strong {
            color: #e8f0e4;
          }
          .footer {
            margin-top: 24px;
            border-top: 1px solid #2a3d2c;
            background: #1b2c1d;
            padding: 18px 24px 22px;
            text-align: center;
            font-size: 13px;
            color: #7a9b80;
          }
          .support-link {
            color: #c8a96e;
            text-decoration: none;
            font-weight: 600;
          }
          .support-link:hover {
            text-decoration: underline;
          }
          .copyright {
            margin-top: 14px;
            color: #5f7d64;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <div class="logo">
                <svg viewBox="0 0 301.913 301.913" xmlns="http://www.w3.org/2000/svg">
                  <g>
                    <path d="m280.968,156.717c-6.244,0-264.634,0-272.439,0-2.638,0-5.129,1.22-6.744,3.306-1.615,2.086-2.174,4.802-1.512,7.356 5.863,22.631 30.002,39.588 58.891,39.588 25.916,0 48.006-13.649 56.511-32.797l162.201,24.209c6.028,0.9 12.149-0.871 16.766-4.85 4.617-3.979 7.272-9.772 7.272-15.866-0.001-11.569-9.378-20.946-20.946-20.946z"/>
                    <path d="m59.707,94.947c-13,0-36.77,36.77-36.77,36.77h73.539c0,0-23.769-36.77-36.769-36.77z"/>
                  </g>
                </svg>
              </div>
              <h1 class="app-name">Seasoned</h1>
              <p class="tagline">Omni Kitchen</p>
            </div>
            <div class="content">
              <p class="greeting">Hello there! 👋</p>
              <p>We received a request to verify your email address: <span class="email-highlight">${email}</span></p>
              <p>Use the code below to sign in and continue finding your next meal.</p>

              <div class="otp-section">
                <div class="otp-box">
                  <p class="otp-code">${otp}</p>
                  <p class="otp-label">Verification Code</p>
                </div>
              </div>

              <div class="warning">
                <strong>⚠️ Important:</strong> This code expires in ${expiryMinutes} minutes. If you did not request this, you can safely ignore this email.
              </div>

              <div class="signature">
                <p>Happy cooking! 🍳<br>
                <strong>The Seasoned Team</strong></p>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated message, please do not reply.</p>
              <p>If you need help, <a href="mailto:support@seasonedapp.com" class="support-link">contact support</a>.</p>
              <p class="copyright">© ${new Date().getFullYear()} Seasoned Recipe App. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate text version of verification email.
   */
  private generateVerificationEmailText(email: string, otp: string, expiryMinutes: number): string {
    return `
Seasoned Recipe App - Email Verification

Hello there! 👋

We received a request to verify your email address: ${email}

Please use the verification code below to complete your verification and start exploring delicious recipes:

Verification Code: ${otp}

IMPORTANT: This code will expire in ${expiryMinutes} minutes.
If you didn't request this verification, please ignore this email.

Happy cooking! 🍳
The Seasoned Team

---
This is an automated message. Please do not reply to this email.
If you have any questions, please contact our support team at support@seasonedapp.com

© ${new Date().getFullYear()} Seasoned Recipe App. All rights reserved.
    `.trim();
  }
}
