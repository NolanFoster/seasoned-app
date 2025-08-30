import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import VideoPopup from '../components/VideoPopup';
import SwipeableRecipeGrid from '../components/SwipeableRecipeGrid';

describe('Components Basic Coverage', () => {
  describe('VideoPopup Basic Tests', () => {
    const mockOnClose = jest.fn();

    beforeEach(() => {
      mockOnClose.mockClear();
    });

    it('should render with basic props', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      // Should render the popup container
      expect(screen.getByText(/recipe video/i)).toBeInTheDocument();
    });

    it('should render close button', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      const closeButton = screen.getByTitle(/close/i);
      expect(closeButton).toBeInTheDocument();
    });

    it('should render minimize button', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      const minimizeButton = screen.getByTitle(/minimize/i);
      expect(minimizeButton).toBeInTheDocument();
    });

    it('should render maximize button', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      const maximizeButton = screen.getByTitle(/maximize/i);
      expect(maximizeButton).toBeInTheDocument();
    });

    it('should handle YouTube URLs', () => {
      render(<VideoPopup videoUrl="https://youtube.com/watch?v=test123" onClose={mockOnClose} />);
      
      const iframe = screen.getByTitle(/recipe video/i);
      expect(iframe).toBeInTheDocument();
      expect(iframe.src).toContain('youtube.com/embed/test123');
    });

    it('should handle Vimeo URLs', () => {
      render(<VideoPopup videoUrl="https://vimeo.com/987654321" onClose={mockOnClose} />);
      
      const iframe = screen.getByTitle(/recipe video/i);
      expect(iframe).toBeInTheDocument();
      expect(iframe.src).toContain('player.vimeo.com/video/987654321');
    });

    it('should handle direct video URLs', () => {
      render(<VideoPopup videoUrl="https://example.com/video.mp4" onClose={mockOnClose} />);
      
      // Should render iframe for direct URLs too
      const iframe = screen.getByTitle(/recipe video/i);
      expect(iframe).toBeInTheDocument();
    });
  });

  describe('SwipeableRecipeGrid Basic Tests', () => {
    it('should render with children', () => {
      render(
        <SwipeableRecipeGrid>
          <div>Test Recipe 1</div>
          <div>Test Recipe 2</div>
        </SwipeableRecipeGrid>
      );
      
      expect(screen.getByText('Test Recipe 1')).toBeInTheDocument();
      expect(screen.getByText('Test Recipe 2')).toBeInTheDocument();
    });

    it('should render without children', () => {
      render(<SwipeableRecipeGrid />);
      
      // Should render container even without children
      const container = document.querySelector('.carousel-container');
      expect(container).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <SwipeableRecipeGrid className="custom-class">
          <div>Test Child</div>
        </SwipeableRecipeGrid>
      );
      
      const grid = screen.getByText('Test Child').closest('.recipe-grid');
      expect(grid).toHaveClass('custom-class');
    });

    it('should have carousel layout class', () => {
      render(
        <SwipeableRecipeGrid>
          <div>Test Child</div>
        </SwipeableRecipeGrid>
      );
      
      const grid = screen.getByText('Test Child').closest('.recipe-grid');
      expect(grid).toHaveClass('carousel-layout');
    });

    it('should pass through additional props', () => {
      render(
        <SwipeableRecipeGrid data-testid="test-grid" aria-label="Test Grid">
          <div>Test Child</div>
        </SwipeableRecipeGrid>
      );
      
      const grid = screen.getByTestId('test-grid');
      expect(grid).toHaveAttribute('aria-label', 'Test Grid');
    });
  });
});