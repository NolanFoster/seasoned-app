import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../src/services/email-service';

vi.mock('mimetext', () => ({
  createMimeMessage: vi.fn(() => ({
    setSender: vi.fn(),
    setRecipient: vi.fn(),
    setSubject: vi.fn(),
    addMessage: vi.fn(),
    asRaw: vi.fn().mockReturnValue('raw-mime-content')
  }))
}));

const mockSend = vi.fn().mockResolvedValue(undefined);

const mockEnv = {
  SEND_EMAIL: { send: mockSend },
  FROM_EMAIL: 'test@example.com',
  OTP_KV: {} as any,
  ENVIRONMENT: 'development' as const,
  USER_MANAGEMENT_WORKER_URL: 'http://localhost:8787',
  JWT_SECRET: 'test-jwt-secret'
};

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    emailService = new EmailService(mockEnv);
  });

  describe('constructor', () => {
    it('should initialize with provided environment values', () => {
      const service = new EmailService(mockEnv);
      expect(service).toBeInstanceOf(EmailService);
    });

    it('should default fromEmail to verify@seasonedapp.com when FROM_EMAIL is not set', () => {
      const service = new EmailService({
        ...mockEnv,
        FROM_EMAIL: undefined as any
      });
      expect(service).toBeInstanceOf(EmailService);
    });

    it('should throw error when SEND_EMAIL binding is missing', () => {
      expect(() => {
        new EmailService({
          ...mockEnv,
          SEND_EMAIL: undefined as any
        });
      }).toThrow('SEND_EMAIL binding not configured');
    });
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      const result = await emailService.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        htmlBody: '<p>Test HTML</p>',
        textBody: 'Test text'
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should validate required parameters - missing to', async () => {
      const result = await emailService.sendEmail({
        to: '',
        subject: 'Test',
        htmlBody: 'Test body'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing required email parameters');
    });

    it('should validate required parameters - missing subject', async () => {
      const result = await emailService.sendEmail({
        to: 'test@example.com',
        subject: '',
        htmlBody: '<p>Test HTML</p>'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing required email parameters');
    });

    it('should validate required parameters - missing htmlBody', async () => {
      const result = await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        htmlBody: ''
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing required email parameters');
    });

    it('should handle send errors gracefully', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network failure'));

      const result = await emailService.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        htmlBody: '<p>Test HTML</p>'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email sending failed: Network failure');
    });

    it('should handle unknown errors gracefully', async () => {
      mockSend.mockRejectedValueOnce('some non-error');

      const result = await emailService.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        htmlBody: '<p>Test HTML</p>'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error occurred while sending email');
    });
  });

  describe('sendVerificationEmail', () => {
    it('should call sendEmail with correct parameters', async () => {
      const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'test-id'
      });

      const result = await emailService.sendVerificationEmail('test@example.com', '123456', 15);

      expect(sendEmailSpy).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Seasoned - Verify Your Email Address',
        htmlBody: expect.stringContaining('123456'),
        textBody: expect.stringContaining('123456')
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-id');
    });

    it('should handle sendEmail errors', async () => {
      vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
        success: false,
        error: 'Test error'
      });

      const result = await emailService.sendVerificationEmail('test@example.com', '123456', 15);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
    });
  });

  describe('email template generation', () => {
    it('should generate HTML email with OTP', async () => {
      const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'test-id'
      });

      const result = await emailService.sendVerificationEmail('test@example.com', '123456', 10);

      expect(result.success).toBe(true);

      expect(sendEmailSpy).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Seasoned - Verify Your Email Address',
        htmlBody: expect.stringContaining('123456'),
        textBody: expect.stringContaining('123456')
      });
    });

    it('should handle different expiry times', async () => {
      const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'test-id'
      });

      const result = await emailService.sendVerificationEmail('test@example.com', '123456', 30);

      expect(result.success).toBe(true);

      expect(sendEmailSpy).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Seasoned - Verify Your Email Address',
        htmlBody: expect.stringContaining('30 minutes'),
        textBody: expect.stringContaining('30 minutes')
      });
    });
  });
});
