import React from 'react';
import { render, screen } from '@testing-library/react';
import VideoPopup from './VideoPopup.jsx';

// Mock the onClose function
const mockOnClose = jest.fn();

describe('VideoPopup Component', () => {
  test('renders video popup with title', () => {
    render(<VideoPopup videoUrl="https://www.youtube.com/watch?v=test123" onClose={mockOnClose} />);
    
    expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
  });

  test('renders close button', () => {
    render(<VideoPopup videoUrl="https://www.youtube.com/watch?v=test123" onClose={mockOnClose} />);
    
    const closeButton = screen.getByTitle('Close');
    expect(closeButton).toBeInTheDocument();
  });

  test('renders minimize and maximize buttons', () => {
    render(<VideoPopup videoUrl="https://www.youtube.com/watch?v=test123" onClose={mockOnClose} />);
    
    const minimizeButton = screen.getByTitle('Minimize');
    const maximizeButton = screen.getByTitle('Maximize');
    
    expect(minimizeButton).toBeInTheDocument();
    expect(maximizeButton).toBeInTheDocument();
  });
});
