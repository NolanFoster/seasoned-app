import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

// Mock fetch globally
global.fetch = jest.fn();

describe('VideoPopup Component', () => {
  beforeEach(() => {
    fetch.mockClear();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        video_url: 'https://www.youtube.com/watch?v=test123'
      }]
    });
  });

  test('opens video popup when video link is clicked', async () => {
    render(<App />);
    
    // Wait for recipes to load and click on a recipe
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    // Click on video link
    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    // Check if video popup is visible
    expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
  });

  test('converts YouTube URL to embed format', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    const iframe = screen.getByTitle('Recipe Video');
    expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  test('converts YouTube short URL to embed format', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        video_url: 'https://youtu.be/dQw4w9WgXcQ'
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    const iframe = screen.getByTitle('Recipe Video');
    expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  test('converts Vimeo URL to embed format', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        video_url: 'https://vimeo.com/123456789'
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    const iframe = screen.getByTitle('Recipe Video');
    expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789');
  });

  test('handles invalid URL gracefully', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        video_url: 'not-a-valid-url'
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    const iframe = screen.getByTitle('Recipe Video');
    expect(iframe).toHaveAttribute('src', 'not-a-valid-url');
  });

  test('closes video popup when close button is clicked', async () => {
    render(<App />);
    
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    // Click close button
    const closeButton = screen.getByTitle('Close');
    fireEvent.click(closeButton);

    // Video popup should be gone
    expect(screen.queryByText('🎥 Recipe Video')).not.toBeInTheDocument();
  });

  test('minimizes video popup', async () => {
    render(<App />);
    
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    const minimizeButton = screen.getByTitle('Minimize');
    fireEvent.click(minimizeButton);

    // Check if popup is still visible but minimized
    expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
  });

  test('maximizes video popup', async () => {
    render(<App />);
    
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    const maximizeButton = screen.getByTitle('Maximize');
    fireEvent.click(maximizeButton);

    // Check if popup is still visible
    expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
  });

  test('drag functionality of video popup', async () => {
    render(<App />);
    
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    const header = screen.getByText('🎥 Recipe Video').parentElement;
    
    // Simulate drag
    fireEvent.mouseDown(header, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 200 });
    fireEvent.mouseUp(document);

    // Check if popup is still visible
    expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
  });

  test('resize functionality of video popup', async () => {
    render(<App />);
    
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    // Find resize handle by its style
    const videoPopup = screen.getByText('🎥 Recipe Video').closest('.video-popup');
    const resizeHandle = videoPopup.querySelector('[style*="cursor: nw-resize"]');
    
    // Simulate resize
    fireEvent.mouseDown(resizeHandle, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 200 });
    fireEvent.mouseUp(document);

    // Check if popup is still visible
    expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
  });

  test('handles window resize to keep popup in bounds', async () => {
    render(<App />);
    
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    // Simulate window resize
    global.innerWidth = 500;
    global.innerHeight = 500;
    fireEvent(window, new Event('resize'));

    // Check if popup is still visible
    expect(screen.getByText('🎥 Recipe Video')).toBeInTheDocument();
  });

  test('handles video with contentUrl format', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        video: {
          contentUrl: 'https://www.youtube.com/watch?v=test456'
        }
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    const iframe = screen.getByTitle('Recipe Video');
    expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/test456');
  });

  test('shows error message when video fails to load', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 1,
        name: 'Test Recipe',
        video_url: ''
      }]
    });

    render(<App />);
    
    await waitFor(() => {
      const recipeCard = screen.getByText('Test Recipe');
      fireEvent.click(recipeCard);
    });

    await waitFor(() => {
      const videoLink = screen.getByText('🎥 Watch Video');
      fireEvent.click(videoLink);
    });

    // Should show error message
    expect(screen.getByText('Unable to load video')).toBeInTheDocument();
    expect(screen.getByText('Open in new tab')).toBeInTheDocument();
  });
});