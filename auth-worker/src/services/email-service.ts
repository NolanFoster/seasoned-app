import { Env } from '../types/env';
import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

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
  private fromEmail: string;
  private env: Env;

  constructor(env: Env) {
    if (!env.SEND_EMAIL) {
      throw new Error('SEND_EMAIL binding not configured');
    }

    this.env = env;
    this.fromEmail = env.FROM_EMAIL || 'verify@seasonedapp.com';
  }

  async sendEmail(options: EmailOptions): Promise<SendEmailResult> {
    try {
      const { to, subject, htmlBody, textBody } = options;

      if (!to || !subject || !htmlBody) {
        return {
          success: false,
          error: 'Missing required email parameters'
        };
      }

      const msg = createMimeMessage();
      msg.setSender({ name: 'Seasoned', addr: this.fromEmail });
      msg.setRecipient(to);
      msg.setSubject(subject);
      msg.addMessage({
        contentType: 'text/html',
        data: htmlBody,
      });

      if (textBody) {
        msg.addMessage({
          contentType: 'text/plain',
          data: textBody,
        });
      }

      const message = new EmailMessage(
        this.fromEmail,
        to,
        msg.asRaw(),
      );

      await this.env.SEND_EMAIL.send(message);

      return {
        success: true,
        messageId: `cf-${Date.now()}`
      };
    } catch (error) {
      console.error('Error sending email:', error);

      if (error instanceof Error) {
        return {
          success: false,
          error: `Email sending failed: ${error.message}`
        };
      }

      return {
        success: false,
        error: 'Unknown error occurred while sending email'
      };
    }
  }

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
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
            background-color: #f5f5f5;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: #ffffff;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
          }
          .header { 
            background: linear-gradient(-45deg, #ff6b6b, #ff8e53, #ff6b35, #ff8e53);
            padding: 40px 20px; 
            text-align: center; 
            color: white;
          }
          .logo { 
            width: 60px; 
            height: 60px; 
            margin: 0 auto 20px; 
            background-color: white; 
            border-radius: 50%; 
            padding: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .logo svg { 
            width: 30px; 
            height: 30px; 
            fill: #ff6b6b;
          }
          .app-name { 
            font-size: 2.5rem; 
            font-weight: bold; 
            margin: 0; 
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .content { 
            padding: 40px 30px; 
            background: #ffffff; 
          }
          .greeting { 
            font-size: 1.25rem; 
            color: #333; 
            margin-bottom: 20px; 
          }
          .email-highlight { 
            color: #ff6b6b; 
            font-weight: 600; 
          }
          .otp-section { 
            text-align: center; 
            margin: 30px 0; 
          }
          .otp-box { 
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); 
            padding: 30px; 
            border-radius: 15px; 
            border: 2px solid #ff6b6b;
            margin: 20px 0; 
            box-shadow: 0 5px 15px rgba(255, 107, 107, 0.1);
          }
          .otp-code { 
            font-size: 36px; 
            font-weight: bold; 
            color: #ff6b6b; 
            letter-spacing: 6px; 
            margin: 10px 0;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .otp-label { 
            font-size: 1.1rem; 
            color: #666; 
            margin: 10px 0; 
          }
          .warning { 
            background: #fff3cd; 
            border: 1px solid #ffeaa7; 
            padding: 20px; 
            border-radius: 10px; 
            margin: 30px 0; 
            border-left: 4px solid #ff6b6b;
          }
          .warning strong { 
            color: #ff6b6b; 
          }
          .footer { 
            background: #f8f9fa; 
            padding: 30px 20px; 
            text-align: center; 
            border-radius: 0 0 15px 15px; 
            font-size: 14px; 
            color: #6c757d; 
            border-top: 1px solid #e9ecef;
          }
          .signature { 
            margin: 30px 0; 
            color: #333; 
          }
          .signature strong { 
            color: #ff6b6b; 
          }
          .support-link { 
            color: #ff6b6b; 
            text-decoration: none; 
            font-weight: 600; 
          }
          .support-link:hover { 
            text-decoration: underline; 
          }
        </style>
      </head>
      <body>
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
          </div>
          <div class="content">
            <p class="greeting">Hello there! \u{1F44B}</p>
            <p>We received a request to verify your email address: <span class="email-highlight">${email}</span></p>
            <p>Please use the verification code below to complete your verification and start exploring delicious recipes:</p>
            
            <div class="otp-section">
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
                <p class="otp-label"><strong>Verification Code</strong></p>
              </div>
            </div>
            
            <div class="warning">
              <strong>\u26A0\uFE0F Important:</strong> This code will expire in ${expiryMinutes} minutes.
              If you didn't request this verification, please ignore this email.
            </div>
            
            <div class="signature">
              <p>Happy cooking! \u{1F373}<br>
              <strong>The Seasoned Team</strong></p>
            </div>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>If you have any questions, please <a href="mailto:support@seasonedapp.com" class="support-link">contact our support team</a>.</p>
            <p style="margin-top: 20px; font-size: 12px; color: #999;">
              \u00A9 ${new Date().getFullYear()} Seasoned Recipe App. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateVerificationEmailText(email: string, otp: string, expiryMinutes: number): string {
    return `
Seasoned Recipe App - Email Verification

Hello there! \u{1F44B}

We received a request to verify your email address: ${email}

Please use the verification code below to complete your verification and start exploring delicious recipes:

Verification Code: ${otp}

IMPORTANT: This code will expire in ${expiryMinutes} minutes.
If you didn't request this verification, please ignore this email.

Happy cooking! \u{1F373}
The Seasoned Team

---
This is an automated message. Please do not reply to this email.
If you have any questions, please contact our support team at support@seasonedapp.com

\u00A9 ${new Date().getFullYear()} Seasoned Recipe App. All rights reserved.
    `.trim();
  }
}
