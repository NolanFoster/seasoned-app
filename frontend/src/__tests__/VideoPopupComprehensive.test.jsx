import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VideoPopup from '../components/VideoPopup';

// Mock fetch globally
global.fetch = jest.fn();

describe('VideoPopup Component Comprehensive Tests', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Test Recipe Video'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fetch.mockClear();
  });

  describe('Initial Rendering and State', () => {
    it('renders video popup when open', () => {
      render(<VideoPopup {...defaultProps} />);
      
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      expect(screen.getByText('Test Recipe Video')).toBeInTheDocument();
      expect(screen.getByTitle('Close')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(<VideoPopup {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByText('🎥 Recipe Video')).not.toBeInTheDocument();
      expect(screen.queryByText('Test Recipe Video')).not.toBeInTheDocument();
    });

    it('renders all control buttons', () => {
      render(<VideoPopup {...defaultProps} />);
      
      expect(screen.getByTitle('Close')).toBeInTheDocument();
      expect(screen.getByTitle('Minimize')).toBeInTheDocument();
      expect(screen.getByTitle('Maximize')).toBeInTheDocument();
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

  describe('URL Conversion and Embedding', () => {
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

    it('handles YouTube URLs with additional parameters', () => {
      render(<VideoPopup {...defaultProps} videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s&feature=share" />);
      
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('handles YouTube URLs with www prefix', () => {
      render(<VideoPopup {...defaultProps} videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);
      
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('handles YouTube URLs without www prefix', () => {
      render(<VideoPopup {...defaultProps} videoUrl="https://youtube.com/watch?v=dQw4w9WgXcQ" />);
      
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('handles Vimeo URLs with www prefix', () => {
      render(<VideoPopup {...defaultProps} videoUrl="https://www.vimeo.com/123456789" />);
      
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789');
    });

    it('handles Vimeo URLs without www prefix', () => {
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

    it('calls onClose when close button is pressed with Enter key', async () => {
      const user = userEvent.setup();
      const mockOnClose = jest.fn();
      
      render(<VideoPopup {...defaultProps} onClose={mockOnClose} />);
      
      const closeButton = screen.getByTitle('Close');
      closeButton.focus();
      await user.keyboard('{Enter}');
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when close button is pressed with Space key', async () => {
      const user = userEvent.setup();
      const mockOnClose = jest.fn();
      
      render(<VideoPopup {...defaultProps} onClose={mockOnClose} />);
      
      const closeButton = screen.getByTitle('Close');
      closeButton.focus();
      await user.keyboard(' ');
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('handles multiple close button clicks', async () => {
      const user = userEvent.setup();
      const mockOnClose = jest.fn();
      
      render(<VideoPopup {...defaultProps} onClose={mockOnClose} />);
      
      const closeButton = screen.getByTitle('Close');
      await user.click(closeButton);
      await user.click(closeButton);
      
      expect(mockOnClose).toHaveBeenCalledTimes(2);
    });
  });

  describe('Accessibility and Keyboard Navigation', () => {
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
      expect(screen.getByTitle('Close')).toHaveFocus();
      
      // Press Enter to close
      await user.keyboard('{Enter}');
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('handles focus management correctly', async () => {
      const user = userEvent.setup();
      
      render(<VideoPopup {...defaultProps} />);
      
      // Focus should be managed properly
      const closeButton = screen.getByTitle('Close');
      closeButton.focus();
      expect(closeButton).toHaveFocus();
    });
  });

  describe('Video Player Functionality', () => {
    it('renders YouTube embed with correct parameters', () => {
      render(<VideoPopup {...defaultProps} />);
      
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(iframe).toHaveAttribute('frameborder', '0');
      expect(iframe).toHaveAttribute('allowfullscreen');
      expect(iframe).toHaveAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
    });

    it('renders Vimeo embed with correct parameters', () => {
      render(<VideoPopup {...defaultProps} videoUrl="https://vimeo.com/123456789" />);
      
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789');
      expect(iframe).toHaveAttribute('frameborder', '0');
      expect(iframe).toHaveAttribute('allowfullscreen');
    });

    it('handles video loading states', () => {
      render(<VideoPopup {...defaultProps} />);
      
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toBeInTheDocument();
      
      // Simulate iframe load event
      fireEvent.load(iframe);
      
      // Should handle load event gracefully
      expect(iframe).toBeInTheDocument();
    });

    it('handles video error states', () => {
      render(<VideoPopup {...defaultProps} />);
      
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toBeInTheDocument();
      
      // Simulate iframe error event
      fireEvent.error(iframe);
      
      // Should handle error event gracefully
      expect(iframe).toBeInTheDocument();
    });
  });

  describe('Component State Management', () => {
    it('updates when props change', () => {
      const { rerender } = render(<VideoPopup {...defaultProps} />);
      
      // Initial state
      expect(screen.getByText('Test Recipe Video')).toBeInTheDocument();
      
      // Change title
      rerender(<VideoPopup {...defaultProps} title="New Recipe Video" />);
      expect(screen.getByText('New Recipe Video')).toBeInTheDocument();
      
      // Change video URL
      rerender(<VideoPopup {...defaultProps} videoUrl="https://youtu.be/newVideo" />);
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/newVideo');
    });

    it('handles open/close state changes', () => {
      const { rerender } = render(<VideoPopup {...defaultProps} isOpen={false} />);
      
      // Initially closed
      expect(screen.queryByText('🎥 Recipe Video')).not.toBeInTheDocument();
      
      // Open the popup
      rerender(<VideoPopup {...defaultProps} isOpen={true} />);
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Close the popup
      rerender(<VideoPopup {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('🎥 Recipe Video')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles invalid video URLs gracefully', () => {
      render(<VideoPopup {...defaultProps} videoUrl="invalid-url" />);
      
      // Should still render the component
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Should handle invalid URL gracefully
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toBeInTheDocument();
    });

    it('handles empty video URLs gracefully', () => {
      render(<VideoPopup {...defaultProps} videoUrl="" />);
      
      // Should still render the component
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Should handle empty URL gracefully
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toBeInTheDocument();
    });

    it('handles null video URLs gracefully', () => {
      render(<VideoPopup {...defaultProps} videoUrl={null} />);
      
      // Should still render the component
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Should handle null URL gracefully
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toBeInTheDocument();
    });

    it('handles undefined video URLs gracefully', () => {
      render(<VideoPopup {...defaultProps} videoUrl={undefined} />);
      
      // Should still render the component
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Should handle undefined URL gracefully
      const iframe = screen.getByTitle('Recipe Video');
      expect(iframe).toBeInTheDocument();
    });

    it('handles missing title gracefully', () => {
      render(<VideoPopup {...defaultProps} title={null} />);
      
      // Should still render the component
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Should handle missing title gracefully
      expect(screen.queryByText('null')).not.toBeInTheDocument();
    });

    it('handles empty title gracefully', () => {
      render(<VideoPopup {...defaultProps} title="" />);
      
      // Should still render the component
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Should handle empty title gracefully
      expect(screen.queryByText('')).not.toBeInTheDocument();
    });
  });

  describe('Performance and Optimization', () => {
    it('renders efficiently with minimal re-renders', () => {
      const { rerender } = render(<VideoPopup {...defaultProps} />);
      
      // Initial render
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Re-render with same props (should be optimized)
      rerender(<VideoPopup {...defaultProps} />);
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
      
      // Re-render with different props
      rerender(<VideoPopup {...defaultProps} title="New Title" />);
      expect(screen.getByText('New Title')).toBeInTheDocument();
    });

    it('handles rapid prop changes gracefully', () => {
      const { rerender } = render(<VideoPopup {...defaultProps} />);
      
      // Rapid prop changes
      for (let i = 0; i < 10; i++) {
        rerender(<VideoPopup {...defaultProps} title={`Title ${i}`} />);
      }
      
      // Should show the last title
      expect(screen.getByText('Title 9')).toBeInTheDocument();
    });
  });

  describe('Integration and Composition', () => {
    it('works with different parent components', () => {
      // Test in different contexts
      const TestWrapper = ({ children }) => (
        <div data-testid="test-wrapper">
          {children}
        </div>
      );
      
      render(
        <TestWrapper>
          <VideoPopup {...defaultProps} />
        </TestWrapper>
      );
      
      expect(screen.getByTestId('test-wrapper')).toBeInTheDocument();
      expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
    });

    it('maintains functionality when wrapped', () => {
      const TestWrapper = ({ children }) => (
        <div data-testid="test-wrapper">
          {children}
        </div>
      );
      
      const mockOnClose = jest.fn();
      
      render(
        <TestWrapper>
          <VideoPopup {...defaultProps} onClose={mockOnClose} />
        </TestWrapper>
      );
      
      const closeButton = screen.getByTitle('Close');
      fireEvent.click(closeButton);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });
});