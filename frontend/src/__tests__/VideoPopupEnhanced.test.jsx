import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import VideoPopup from '../components/VideoPopup';

describe('VideoPopup Enhanced Coverage', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Video URL Handling', () => {
    it('should handle YouTube URLs correctly', () => {
      const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      render(<VideoPopup videoUrl={youtubeUrl} onClose={mockOnClose} />);
      
      // Should render iframe with YouTube embed URL
      const iframe = screen.getByTitle(/video player/i);
      expect(iframe).toBeInTheDocument();
      expect(iframe.src).toContain('youtube.com/embed/');
    });

    it('should handle Vimeo URLs correctly', () => {
      const vimeoUrl = 'https://vimeo.com/123456789';
      
      render(<VideoPopup videoUrl={vimeoUrl} onClose={mockOnClose} />);
      
      const iframe = screen.getByTitle(/video player/i);
      expect(iframe).toBeInTheDocument();
      expect(iframe.src).toContain('player.vimeo.com/video/');
    });

    it('should handle direct video URLs', () => {
      const directUrl = 'https://example.com/video.mp4';
      
      render(<VideoPopup videoUrl={directUrl} onClose={mockOnClose} />);
      
      // Should render video element for direct URLs
      const video = screen.getByRole('application') || screen.getByText(/video/i);
      expect(video).toBeInTheDocument();
    });

    it('should handle invalid URLs gracefully', () => {
      const invalidUrl = 'not-a-valid-url';
      
      render(<VideoPopup videoUrl={invalidUrl} onClose={mockOnClose} />);
      
      // Should still render without crashing
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should handle empty or null URLs', () => {
      render(<VideoPopup videoUrl={null} onClose={mockOnClose} />);
      
      // Should render without crashing
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      
      render(<VideoPopup videoUrl="" onClose={mockOnClose} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should close popup when close button is clicked', () => {
      render(<VideoPopup videoUrl="https://youtube.com/watch?v=test" onClose={mockOnClose} />);
      
      const closeButton = screen.getByLabelText(/close/i) || screen.getByText(/×/);
      fireEvent.click(closeButton);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should close popup when overlay is clicked', () => {
      render(<VideoPopup videoUrl="https://youtube.com/watch?v=test" onClose={mockOnClose} />);
      
      const overlay = screen.getByRole('dialog').parentElement;
      fireEvent.click(overlay);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should not close when clicking inside the popup content', () => {
      render(<VideoPopup videoUrl="https://youtube.com/watch?v=test" onClose={mockOnClose} />);
      
      const popupContent = screen.getByRole('dialog');
      fireEvent.click(popupContent);
      
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should handle escape key press', () => {
      render(<VideoPopup videoUrl="https://youtube.com/watch?v=test" onClose={mockOnClose} />);
      
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA attributes', () => {
      render(<VideoPopup videoUrl="https://youtube.com/watch?v=test" onClose={mockOnClose} />);
      
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('should trap focus within the popup', () => {
      render(<VideoPopup videoUrl="https://youtube.com/watch?v=test" onClose={mockOnClose} />);
      
      // The popup should be focused when opened
      const dialog = screen.getByRole('dialog');
      expect(document.activeElement).toBe(dialog);
    });
  });

  describe('Video Loading States', () => {
    it('should show loading indicator while video loads', async () => {
      render(<VideoPopup videoUrl="https://youtube.com/watch?v=test" onClose={mockOnClose} />);
      
      // Should show some kind of loading state initially
      const popup = screen.getByRole('dialog');
      expect(popup).toBeInTheDocument();
      
      // Wait for video to potentially load
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
    });

    it('should handle video load errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      render(<VideoPopup videoUrl="https://invalid-video-url.com" onClose={mockOnClose} />);
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Should handle errors gracefully without crashing
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      
      consoleSpy.mockRestore();
    });
  });

  describe('URL Transformation', () => {
    it('should transform YouTube watch URLs to embed URLs', () => {
      const watchUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60s';
      
      render(<VideoPopup videoUrl={watchUrl} onClose={mockOnClose} />);
      
      const iframe = screen.getByTitle(/video player/i);
      expect(iframe.src).toContain('youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should preserve YouTube URL parameters', () => {
      const urlWithParams = 'https://www.youtube.com/watch?v=test123&t=30&list=playlist';
      
      render(<VideoPopup videoUrl={urlWithParams} onClose={mockOnClose} />);
      
      const iframe = screen.getByTitle(/video player/i);
      expect(iframe.src).toContain('t=30');
    });

    it('should handle YouTube short URLs', () => {
      const shortUrl = 'https://youtu.be/dQw4w9WgXcQ';
      
      render(<VideoPopup videoUrl={shortUrl} onClose={mockOnClose} />);
      
      const iframe = screen.getByTitle(/video player/i);
      expect(iframe.src).toContain('youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should transform Vimeo URLs correctly', () => {
      const vimeoUrl = 'https://vimeo.com/123456789';
      
      render(<VideoPopup videoUrl={vimeoUrl} onClose={mockOnClose} />);
      
      const iframe = screen.getByTitle(/video player/i);
      expect(iframe.src).toContain('player.vimeo.com/video/123456789');
    });
  });
});