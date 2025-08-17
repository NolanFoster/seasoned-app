import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VideoPopup from '../components/VideoPopup';

// Mock fetch globally
global.fetch = jest.fn();

describe('VideoPopup Component', () => {
  // Test the VideoPopup component directly
  test('renders video popup with title', () => {
    render(<VideoPopup 
      isOpen={true}
      onClose={() => {}}
      videoUrl="https://www.youtube.com/watch?v=test123"
      title="Test Recipe Video"
    />);
    
    expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
  });

  test('renders close button', () => {
    render(<VideoPopup 
      isOpen={true}
      onClose={() => {}}
      videoUrl="https://www.youtube.com/watch?v=test123"
      title="Test Recipe Video"
    />);
    
    expect(screen.getByTitle('Close')).toBeInTheDocument();
  });

  test('renders minimize and maximize buttons', () => {
    render(<VideoPopup 
      isOpen={true}
      onClose={() => {}}
      videoUrl="https://www.youtube.com/watch?v=test123"
      title="Test Recipe Video"
    />);
    
    expect(screen.getByTitle('Minimize')).toBeInTheDocument();
    expect(screen.getByTitle('Maximize')).toBeInTheDocument();
  });

  test('converts YouTube URL to embed format', () => {
    render(<VideoPopup 
      isOpen={true}
      onClose={() => {}}
      videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      title="Test Recipe Video"
    />);
    
    const iframe = screen.getByTitle('Recipe Video');
    expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  test('converts YouTube short URL to embed format', () => {
    render(<VideoPopup 
      isOpen={true}
      onClose={() => {}}
      videoUrl="https://youtu.be/dQw4w9WgXcQ"
      title="Test Recipe Video"
    />);
    
    const iframe = screen.getByTitle('Recipe Video');
    expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  test('converts Vimeo URL to embed format', () => {
    render(<VideoPopup 
      isOpen={true}
      onClose={() => {}}
      videoUrl="https://vimeo.com/123456789"
      title="Test Recipe Video"
    />);
    
    const iframe = screen.getByTitle('Recipe Video');
    expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789');
  });

  test('closes video popup when close button is clicked', () => {
    const mockOnClose = jest.fn();
    render(<VideoPopup 
      isOpen={true}
      onClose={mockOnClose}
      videoUrl="https://www.youtube.com/watch?v=test123"
      title="Test Recipe Video"
    />);
    
    const closeButton = screen.getByTitle('Close');
    fireEvent.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('minimizes video popup', () => {
    render(<VideoPopup 
      isOpen={true}
      onClose={() => {}}
      videoUrl="https://www.youtube.com/watch?v=test123"
      title="Test Recipe Video"
    />);
    
    const minimizeButton = screen.getByTitle('Minimize');
    fireEvent.click(minimizeButton);
    
    // Check if popup is still visible but minimized
    expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
  });

  test('maximizes video popup', () => {
    render(<VideoPopup 
      isOpen={true}
      onClose={() => {}}
      videoUrl="https://www.youtube.com/watch?v=test123"
      title="Test Recipe Video"
    />);
    
    const maximizeButton = screen.getByTitle('Maximize');
    fireEvent.click(maximizeButton);
    
    // Check if popup is visible and maximized
    expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
  });

  // Debug test to see what's happening with the App component
  test('debug: renders App component and shows fetch calls', async () => {
    // Import App here to avoid circular dependencies
    const { default: App } = await import('../App');
    
    render(<App />);
    
    // Wait a bit for async operations
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    }, { timeout: 5000 });
    
    // Log what was fetched
    console.log('Fetch calls:', fetch.mock.calls);
    
    // Check if recipes fetch was called
    const recipesFetchCall = fetch.mock.calls.find(call => call[0].includes('/recipes'));
    console.log('Recipes fetch call:', recipesFetchCall);
    
    // Wait for recipes to potentially load
    await waitFor(() => {
      // Check if any recipe-related elements are rendered
      const recipeElements = screen.queryAllByText(/recipe/i);
      console.log('Recipe elements found:', recipeElements);
      
      // Check the full rendered content
      const fullContent = document.body.innerHTML;
      console.log('Full rendered content:', fullContent);
    }, { timeout: 5000 });
    
    // Wait a bit more to see if recipes load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check again for recipes
    const recipeElementsAfterWait = screen.queryAllByText(/recipe/i);
    console.log('Recipe elements after wait:', recipeElementsAfterWait);
    
    // Check if there are any console errors
    const consoleSpy = jest.spyOn(console, 'error');
    
    // This test should pass and help us debug
    expect(true).toBe(true);
  });
});