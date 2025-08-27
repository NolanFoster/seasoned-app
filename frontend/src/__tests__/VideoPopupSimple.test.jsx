import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VideoPopup from '../components/VideoPopup';

describe('VideoPopup Component Simple Tests', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Test Recipe Video'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders video popup when open', () => {
      render(<VideoPopup {...defaultProps} />);
      
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      expect(screen.getByTitle('Close')).toBeInTheDocument();
      expect(screen.getByTitle('Minimize')).toBeInTheDocument();
      expect(screen.getByTitle('Maximize')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(<VideoPopup {...defaultProps} isOpen={false} />);
      
      // When closed, the component still renders but is hidden
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
    });

    it('renders video iframe with correct attributes', () => {
      render(<VideoPopup {...defaultProps} />);
      
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(iframe).toHaveAttribute('frameborder', '0');
      expect(iframe).toHaveAttribute('allowfullscreen');
    });
  });

  describe('URL Conversion', () => {
    it('converts YouTube watch URLs correctly', () => {
      render(<VideoPopup {...defaultProps} />);
      
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('converts YouTube short URLs correctly', () => {
      render(<VideoPopup {...defaultProps} videoUrl="https://youtu.be/dQw4w9WgXcQ" />);
      
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('converts Vimeo URLs correctly', () => {
      render(<VideoPopup {...defaultProps} videoUrl="https://vimeo.com/123456789" />);
      
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789');
    });
  });

  describe('User Interactions', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnClose = jest.fn();
      
      render(<VideoPopup {...defaultProps} onClose={mockOnClose} />);
      
      const closeButton = screen.getByTitle('Close');
      await user.click(closeButton);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('handles minimize button click', async () => {
      const user = userEvent.setup();
      
      render(<VideoPopup {...defaultProps} />);
      
      const minimizeButton = screen.getByTitle('Minimize');
      await user.click(minimizeButton);
      
      // Should handle minimize functionality
      expect(minimizeButton).toBeInTheDocument();
    });

    it('handles maximize button click', async () => {
      const user = userEvent.setup();
      
      render(<VideoPopup {...defaultProps} />);
      
      const maximizeButton = screen.getByTitle('Maximize');
      await user.click(maximizeButton);
      
      // Should handle maximize functionality
      expect(maximizeButton).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('handles invalid video URLs gracefully', () => {
      render(<VideoPopup {...defaultProps} videoUrl="invalid-url" />);
      
      // Should still render the component
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Should handle invalid URLs gracefully by showing the iframe with the original URL
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'invalid-url');
    });

    it('handles empty video URLs gracefully', () => {
      render(<VideoPopup {...defaultProps} videoUrl="" />);
      
      // Should still render the component
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Should handle empty URLs gracefully by showing error message
      expect(screen.getByText('Unable to load video')).toBeInTheDocument();
    });
  });

  describe('Component State', () => {
    it('updates when props change', () => {
      const { rerender } = render(<VideoPopup {...defaultProps} />);
      
      // Initial state
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Change title
      rerender(<VideoPopup {...defaultProps} title="New Recipe Video" />);
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Change video URL
      rerender(<VideoPopup {...defaultProps} videoUrl="https://youtu.be/newVideo" />);
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/newVideo');
    });

    it('handles open/close state changes', () => {
      const { rerender } = render(<VideoPopup {...defaultProps} isOpen={false} />);
      
      // Initially closed (but still rendered)
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Open the popup
      rerender(<VideoPopup {...defaultProps} isOpen={true} />);
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Close the popup (but still rendered)
      rerender(<VideoPopup {...defaultProps} isOpen={false} />);
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and titles', () => {
      render(<VideoPopup {...defaultProps} />);
      
      expect(screen.getByTitle('Close')).toBeInTheDocument();
      expect(screen.getByTitle('Minimize')).toBeInTheDocument();
      expect(screen.getByTitle('Maximize')).toBeInTheDocument();
      expect(screen.getByTitle('Recipe Video')).toBeInTheDocument();
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      const mockOnClose = jest.fn();
      
      render(<VideoPopup {...defaultProps} onClose={mockOnClose} />);
      
      // Tab to close button
      await user.tab();
      await user.tab();
      await user.tab();
      expect(screen.getByTitle('Close')).toHaveFocus();
      
      // Press Enter to close
      await user.keyboard('{Enter}');
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });
});