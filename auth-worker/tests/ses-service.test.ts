import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SESService } from '../src/services/ses-service';

// Mock AWS SDK
vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn(() => ({
    send: vi.fn()
  })),
  SendEmailCommand: vi.fn()
}));

// Mock environment
const mockEnv = {
  AWS_ACCESS_KEY_ID: 'test-access-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret-key',
  AWS_REGION: 'us-east-2',
  FROM_EMAIL: 'test@example.com',
  OTP_KV: {} as any,
  ENVIRONMENT: 'development' as const,
  USER_MANAGEMENT_WORKER_URL: 'http://localhost:8787',
  JWT_SECRET: 'test-jwt-secret'
};

describe('SESService', () => {
  let sesService: SESService;

  beforeEach(() => {
    vi.clearAllMocks();
    sesService = new SESService(mockEnv);
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const service = new SESService({
        ...mockEnv,
        AWS_REGION: undefined as any,
        FROM_EMAIL: undefined as any
      });

      expect(service).toBeInstanceOf(SESService);
    });

    it('should use provided environment values', () => {
      const service = new SESService(mockEnv);
      expect(service).toBeInstanceOf(SESService);
    });

    it('should throw error when AWS credentials are missing', () => {
      expect(() => {
        new SESService({
          ...mockEnv,
          AWS_ACCESS_KEY_ID: undefined as any,
          AWS_SECRET_ACCESS_KEY: undefined as any
        });
      }).toThrow('AWS credentials not configured');
    });
  });

  describe('sendEmail', () => {
    it('should validate required parameters', async () => {
      const result = await sesService.sendEmail({
        to: '',
        subject: 'Test',
        htmlBody: 'Test body'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing required email parameters');
    });

    it('should validate missing email', async () => {
      const result = await sesService.sendEmail({
        to: '',
        subject: 'Test',
        htmlBody: '<p>Test HTML</p>'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing required email parameters');
    });

    it('should validate missing subject', async () => {
      const result = await sesService.sendEmail({
        to: 'test@example.com',
        subject: '',
        htmlBody: '<p>Test HTML</p>'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing required email parameters');
    });

    it('should validate missing html body', async () => {
      const result = await sesService.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        htmlBody: ''
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing required email parameters');
    });
  });

  describe('sendVerificationEmail', () => {
    it('should call sendEmail with correct parameters', async () => {
      // Mock the sendEmail method
      const sendEmailSpy = vi.spyOn(sesService, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'test-id'
      });

      const result = await sesService.sendVerificationEmail('test@example.com', '123456', 15);

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
      // Mock the sendEmail method to return an error
      vi.spyOn(sesService, 'sendEmail').mockResolvedValue({
        success: false,
        error: 'Test error'
      });

      const result = await sesService.sendVerificationEmail('test@example.com', '123456', 15);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
    });
  });

  describe('email template generation', () => {
    it('should generate HTML email with OTP', async () => {
      // Mock the sendEmail method
      const sendEmailSpy = vi.spyOn(sesService, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'test-id'
      });

      const result = await sesService.sendVerificationEmail('test@example.com', '123456', 10);

      expect(result.success).toBe(true);
      
      // Verify the sendEmail was called with the right parameters
      expect(sendEmailSpy).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Seasoned - Verify Your Email Address',
        htmlBody: expect.stringContaining('123456'),
        textBody: expect.stringContaining('123456')
      });
    });

    it('should handle different expiry times', async () => {
      // Mock the sendEmail method
      const sendEmailSpy = vi.spyOn(sesService, 'sendEmail').mockResolvedValue({
        success: true,
        messageId: 'test-id'
      });

      const result = await sesService.sendVerificationEmail('test@example.com', '123456', 30);

      expect(result.success).toBe(true);
      
      // Verify the sendEmail was called with the right parameters
      expect(sendEmailSpy).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Seasoned - Verify Your Email Address',
        htmlBody: expect.stringContaining('30 minutes'),
        textBody: expect.stringContaining('30 minutes')
      });
    });
  });
});
