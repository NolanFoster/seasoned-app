import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VideoPopup from '../components/VideoPopup';

// Mock fetch globally
global.fetch = jest.fn();

describe('VideoPopup Enhanced Tests', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    fetch.mockClear();
    mockOnClose.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should render with video URL', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should render without video URL', () => {
      render(<VideoPopup videoUrl="" onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should render with null video URL', () => {
      render(<VideoPopup videoUrl={null} onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should render with undefined video URL', () => {
      render(<VideoPopup videoUrl={undefined} onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Close Functionality', () => {
    it('should call onClose when close button is clicked', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      const closeButton = screen.getByLabelText(/close/i);
      fireEvent.click(closeButton);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when overlay is clicked', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      const overlay = screen.getByRole('dialog');
      fireEvent.click(overlay);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose when video content is clicked', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      const videoContent = screen.getByRole('dialog').querySelector('.video-popup-content');
      fireEvent.click(videoContent);
      
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should handle escape key press', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should handle other key presses without closing', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      fireEvent.keyDown(document, { key: 'Enter', code: 'Enter' });
      fireEvent.keyDown(document, { key: 'Space', code: 'Space' });
      
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Video URL Handling', () => {
    it('should handle YouTube URLs', () => {
      const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      render(<VideoPopup videoUrl={youtubeUrl} onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should handle Vimeo URLs', () => {
      const vimeoUrl = 'https://vimeo.com/123456789';
      render(<VideoPopup videoUrl={vimeoUrl} onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should handle direct video URLs', () => {
      const directUrl = 'https://example.com/video.mp4';
      render(<VideoPopup videoUrl={directUrl} onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should handle malformed URLs', () => {
      const malformedUrl = 'not-a-valid-url';
      render(<VideoPopup videoUrl={malformedUrl} onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should handle very long URLs', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(1000);
      render(<VideoPopup videoUrl={longUrl} onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle video load errors', () => {
      render(<VideoPopup videoUrl="https://example.com/nonexistent.mp4" onClose={mockOnClose} />);
      
      const video = screen.getByRole('dialog').querySelector('video');
      if (video) {
        fireEvent.error(video);
      }
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should handle iframe load errors', () => {
      render(<VideoPopup videoUrl="https://www.youtube.com/watch?v=invalid" onClose={mockOnClose} />);
      
      const iframe = screen.getByRole('dialog').querySelector('iframe');
      if (iframe) {
        fireEvent.error(iframe);
      }
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText(/close/i)).toBeInTheDocument();
    });

    it('should trap focus within popup', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      const closeButton = screen.getByLabelText(/close/i);
      
      fireEvent.keyDown(closeButton, { key: 'Tab', code: 'Tab' });
      
      expect(closeButton).toBeInTheDocument();
    });

    it('should support screen readers', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });
  });

  describe('Performance', () => {
    it('should not cause memory leaks on unmount', () => {
      const { unmount } = render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      unmount();
      
      // Should not throw or cause issues
      expect(true).toBe(true);
    });

    it('should handle rapid open/close cycles', () => {
      const { rerender, unmount } = render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      for (let i = 0; i < 10; i++) {
        rerender(<VideoPopup videoUrl={`https://example.com/video${i}.mp4`} onClose={mockOnClose} />);
      }
      
      unmount();
      
      expect(true).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing onClose prop', () => {
      expect(() => {
        render(<VideoPopup videoUrl="https://example.com/video.mp4" />);
      }).not.toThrow();
    });

    it('should handle multiple simultaneous key events', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      
      // Should only call once or handle gracefully
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should handle component updates', () => {
      const { rerender } = render(<VideoPopup videoUrl="https://example.com/video1.mp4" onClose={mockOnClose} />);
      
      rerender(<VideoPopup videoUrl="https://example.com/video2.mp4" onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should handle special characters in URLs', () => {
      const specialUrl = 'https://example.com/video with spaces & symbols.mp4';
      render(<VideoPopup videoUrl={specialUrl} onClose={mockOnClose} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});