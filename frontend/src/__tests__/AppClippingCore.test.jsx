import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Define the worker URLs
const CLIPPER_API_URL = 'https://recipe-clipper-worker.nolanfoster.workers.dev';
const KV_API_URL = 'https://recipe-kv-worker.nolanfoster.workers.dev';

// Mock window functions
global.alert = jest.fn();
global.confirm = jest.fn();

describe('App Component - Core Clipping Functionality', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    alert.mockClear();
    confirm.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('complete clipping workflow - clip and save recipe', async () => {
    // Mock successful clipper response
    mockFetch.mockImplementation((url) => {
      if (url.includes('clipper-worker') && url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'healthy' })
        });
      } else if (url.includes('clipper-worker') && url.includes('/clip')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            name: 'Test Recipe',
            description: 'A test recipe',
            ingredients: ['ingredient 1', 'ingredient 2'],
            instructions: ['step 1', 'step 2'],
            source_url: 'https://example.com/recipe',
            image_url: 'https://example.com/image.jpg'
          })
        });
      } else if (url.includes('kv-worker/add')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 1 })
        });
      } else if (url.includes('kv-worker/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, recipes: [] })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const user = userEvent.setup();
    render(<App />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search recipes or paste a URL to clip...')).toBeInTheDocument();
    });

    // Click search button with empty input to open clip dialog
    const searchButton = screen.getByRole('button', { name: 'Search' });
    fireEvent.click(searchButton);
    
    await waitFor(() => {
      expect(screen.getByText('Clip Recipe from Website')).toBeInTheDocument();
    });

    // Enter URL and clip
    await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://example.com/recipe');
    
    // Verify the URL was entered
    expect(screen.getByDisplayValue('https://example.com/recipe')).toBeInTheDocument();
    
    // Click the clip button
    await user.click(screen.getByRole('button', { name: /Clip Recipe/i }));

    // Wait for the preview to appear - just check that it transitions to preview
    await waitFor(() => {
      expect(screen.getByText('Clipped Recipe Preview')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Verify the clip endpoint was called with the correct URL
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/clip'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/recipe' })
      })
    );
  });
});