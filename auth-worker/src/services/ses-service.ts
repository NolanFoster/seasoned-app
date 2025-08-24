import { Env } from '../types/env';
import { SESClient, SendEmailCommand, SendEmailCommandInput } from '@aws-sdk/client-ses';

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

export class SESService {
  private sesClient: SESClient;
  private fromEmail: string;

  constructor(env: Env) {
    // Validate AWS credentials
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured');
    }
    
    this.fromEmail = env.FROM_EMAIL || 'noreply@yourdomain.com';
    
    // Initialize SES client with credentials
    this.sesClient = new SESClient({
      region: env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  /**
   * Send an email using AWS SES
   */
  async sendEmail(options: EmailOptions): Promise<SendEmailResult> {
    try {
      const { to, subject, htmlBody, textBody } = options;

      // Validate inputs
      if (!to || !subject || !htmlBody) {
        return {
          success: false,
          error: 'Missing required email parameters'
        };
      }

      // Prepare the email request
      const emailParams: SendEmailCommandInput = {
        Source: this.fromEmail,
        Destination: {
          ToAddresses: [to]
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: 'UTF-8'
            },
            ...(textBody && {
              Text: {
                Data: textBody,
                Charset: 'UTF-8'
              }
            })
          }
        }
      };

      // Send the email using AWS SES
      const command = new SendEmailCommand(emailParams);
      const response = await this.sesClient.send(command);

      if (response.MessageId) {
        return {
          success: true,
          messageId: response.MessageId
        };
      } else {
        return {
          success: false,
          error: 'No message ID returned from SES'
        };
      }
    } catch (error) {
      console.error('Error sending email:', error);
      
      // Handle specific AWS errors
      if (error instanceof Error) {
        if (error.name === 'MessageRejected') {
          return {
            success: false,
            error: 'Email rejected by SES: Message content not allowed'
          };
        } else if (error.name === 'MailFromDomainNotVerified') {
          return {
            success: false,
            error: 'Sender email domain not verified in SES'
          };
        } else if (error.name === 'ConfigurationSetDoesNotExist') {
          return {
            success: false,
            error: 'SES configuration set not found'
          };
        } else {
          return {
            success: false,
            error: `SES error: ${error.message}`
          };
        }
      }
      
      return {
        success: false,
        error: 'Unknown error occurred while sending email'
      };
    }
  }

  /**
   * Send a verification email with OTP
   */
  async sendVerificationEmail(to: string, otp: string, otpExpiryMinutes: number = 10): Promise<SendEmailResult> {
    const subject = 'Verify Your Email Address';
    const htmlBody = this.generateVerificationEmailHTML(to, otp, otpExpiryMinutes);
    const textBody = this.generateVerificationEmailText(to, otp, otpExpiryMinutes);

    return this.sendEmail({
      to,
      subject,
      htmlBody,
      textBody
    });
  }

  /**
   * Generate HTML version of verification email
   */
  private generateVerificationEmailHTML(email: string, otp: string, expiryMinutes: number): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e9ecef; }
          .otp-box { background: #f8f9fa; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
          .otp-code { font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 4px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Email Verification</h1>
          </div>
          <div class="content">
            <p>Hello!</p>
            <p>We received a request to verify your email address: <strong>${email}</strong></p>
            <p>Please use the verification code below to complete your verification:</p>
            
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
              <p><strong>Verification Code</strong></p>
            </div>
            
            <div class="warning">
              <strong>⚠️ Important:</strong> This code will expire in ${expiryMinutes} minutes.
              If you didn't request this verification, please ignore this email.
            </div>
            
            <p>Best regards,<br>The Recipe App Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>If you have any questions, please contact our support team.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate text version of verification email
   */
  private generateVerificationEmailText(email: string, otp: string, expiryMinutes: number): string {
    return `
Email Verification

Hello!

We received a request to verify your email address: ${email}

Please use the verification code below to complete your verification:

Verification Code: ${otp}

IMPORTANT: This code will expire in ${expiryMinutes} minutes.
If you didn't request this verification, please ignore this email.

Best regards,
The Recipe App Team

---
This is an automated message. Please do not reply to this email.
If you have any questions, please contact our support team.
    `.trim();
  }
}
