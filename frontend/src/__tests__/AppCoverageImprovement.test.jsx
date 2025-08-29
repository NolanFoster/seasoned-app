import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

// Mock the components
jest.mock('../components/VideoPopup', () => {
  return function MockVideoPopup() {
    return <div data-testid="video-popup">Video Popup</div>;
  };
});

jest.mock('../components/Recommendations', () => {
  return function MockRecommendations() {
    return <div data-testid="recommendations-container">Recommendations</div>;
  };
});

// Mock fetch
global.fetch = jest.fn();

describe('App Component', () => {
  beforeEach(() => {
    fetch.mockImplementation((url) => {
      if (url.includes('/recommendations')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            recommendations: { 'Test': ['query'] }
          })
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render without crashing', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });
  });

  it('should show search input', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search recipes/i)).toBeInTheDocument();
    });
  });

  it('should render recommendations component', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('recommendations-container')).toBeInTheDocument();
    });
  });
});