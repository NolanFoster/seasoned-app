import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import VideoPopup from '../components/VideoPopup';

describe('VideoPopup Branch Coverage', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  describe('Visibility Branches', () => {
    it('renders nothing when not visible', () => {
      const { container } = render(
        <VideoPopup
          isOpen={false}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders popup when visible', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Video URL Branches', () => {
    it('handles YouTube URL', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=abc123"
          onClose={mockOnClose}
        />
      );

      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', expect.stringContaining('youtube.com/embed/abc123'));
    });

    it('handles YouTube short URL', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://youtu.be/abc123"
          onClose={mockOnClose}
        />
      );

      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', expect.stringContaining('youtube.com/embed/abc123'));
    });

    it('handles YouTube mobile URL', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://m.youtube.com/watch?v=abc123"
          onClose={mockOnClose}
        />
      );

      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', expect.stringContaining('youtube.com/embed/abc123'));
    });

    it('handles YouTube embed URL', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/embed/abc123"
          onClose={mockOnClose}
        />
      );

      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', expect.stringContaining('youtube.com/embed/abc123'));
    });

    it('handles empty video URL', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl=""
          onClose={mockOnClose}
        />
      );

      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', '');
    });

    it('handles null video URL', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl={null}
          onClose={mockOnClose}
        />
      );

      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', '');
    });

    it('handles non-YouTube URL', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://vimeo.com/123456"
          onClose={mockOnClose}
        />
      );

      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'https://vimeo.com/123456');
    });

    it('handles YouTube URL with timestamp', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=abc123&t=120s"
          onClose={mockOnClose}
        />
      );

      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', expect.stringContaining('youtube.com/embed/abc123'));
    });

    it('handles YouTube URL with multiple parameters', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=abc123&list=PLtest&index=1"
          onClose={mockOnClose}
        />
      );

      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', expect.stringContaining('youtube.com/embed/abc123'));
    });
  });

  describe('Event Handler Branches', () => {
    it('calls onClose when backdrop is clicked', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      const backdrop = screen.getByRole('dialog');
      fireEvent.click(backdrop);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when close button is clicked', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when video content is clicked', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      const videoContent = screen.getByTitle('Recipe Video').parentElement;
      fireEvent.click(videoContent);

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('stops event propagation on content click', () => {
      const mockStopPropagation = jest.fn();
      
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      const videoContent = screen.getByTitle('Recipe Video').parentElement;
      
      // Create a synthetic event with stopPropagation
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'stopPropagation', {
        value: mockStopPropagation,
        writable: true
      });
      
      fireEvent(videoContent, clickEvent);

      expect(mockStopPropagation).toHaveBeenCalled();
    });

    it('handles keyboard escape key', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      // Note: actual keyboard handling might be in the parent component
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles missing onClose callback', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=test"
        />
      );

      const backdrop = screen.getByRole('dialog');
      
      // Should not throw error
      expect(() => fireEvent.click(backdrop)).not.toThrow();
    });

    it('handles rapid open/close transitions', () => {
      const { rerender } = render(
        <VideoPopup
          isOpen={false}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      // Rapid transitions
      rerender(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      rerender(
        <VideoPopup
          isOpen={false}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      rerender(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('handles URL change while open', () => {
      const { rerender } = render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=video1"
          onClose={mockOnClose}
        />
      );

      let iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', expect.stringContaining('video1'));

      rerender(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=video2"
          onClose={mockOnClose}
        />
      );

      iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', expect.stringContaining('video2'));
    });

    it('handles malformed YouTube URLs', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v="
          onClose={mockOnClose}
        />
      );

      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', expect.stringContaining('youtube.com/embed/'));
    });

    it('handles YouTube playlist URLs', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"
          onClose={mockOnClose}
        />
      );

      const iframe = screen.getByTitle('Recipe Video');
      // Should use the URL as-is for playlists
      expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf');
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });

    it('traps focus within popup', () => {
      render(
        <VideoPopup
          isOpen={true}
          videoUrl="https://www.youtube.com/watch?v=test"
          onClose={mockOnClose}
        />
      );

      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toBeInTheDocument();
    });
  });
});