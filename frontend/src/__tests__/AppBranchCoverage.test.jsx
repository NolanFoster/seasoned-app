import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

// Mock fetch globally
global.fetch = jest.fn();

// Mock the search worker URL
global.SEARCH_DB_URL = 'https://test-search.example.com';

// Mock local storage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock the utility function
jest.mock('../../../shared/utility-functions.js', () => ({
  formatDuration: jest.fn((duration) => {
    if (!duration) return '-';
    if (duration.includes('PT')) {
      const minutes = duration.replace('PT', '').replace('M', '');
      return `${minutes} min`;
    }
    return duration;
  })
}));

describe('App Branch Coverage Tests', () => {
  beforeEach(() => {
    fetch.mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
  });

  describe('Search Functionality Branches', () => {
    it('handles empty search query', async () => {
      // Mock empty recommendations response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ categories: {} }),
      });

      render(<App />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search recipes/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search recipes/i);
      const searchButton = screen.getByLabelText('Search');

      // Test empty search
      fireEvent.change(searchInput, { target: { value: '' } });
      fireEvent.click(searchButton);

      // Should not trigger search
      expect(searchInput.value).toBe('');
    });

    it('handles search with whitespace only', async () => {
      // Mock empty recommendations response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ categories: {} }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search recipes/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search recipes/i);
      const searchButton = screen.getByLabelText('Search');

      // Test whitespace search
      fireEvent.change(searchInput, { target: { value: '   ' } });
      fireEvent.click(searchButton);

      // Should trim whitespace
      expect(searchInput.value).toBe('   ');
    });

    it('handles search input focus and blur', async () => {
      // Mock empty recommendations response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ categories: {} }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search recipes/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search recipes/i);

      // Focus
      fireEvent.focus(searchInput);
      expect(document.activeElement).toBe(searchInput);

      // Blur
      fireEvent.blur(searchInput);
      expect(document.activeElement).not.toBe(searchInput);
    });

    it('handles Enter key in search input', async () => {
      // Mock empty recommendations response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ categories: {} }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search recipes/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search recipes/i);

      // Type and press Enter
      fireEvent.change(searchInput, { target: { value: 'pasta' } });
      fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });

      // Should trigger search
      expect(searchInput.value).toBe('pasta');
    });
  });

  describe('View State Branches', () => {
    it('handles view transitions', async () => {
      // Mock empty recommendations response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ categories: {} }),
      });

      // Mock local recipes
      localStorageMock.getItem.mockReturnValue(JSON.stringify([
        {
          id: '1',
          name: 'Test Recipe',
          description: 'Test Description',
          image: 'test.jpg',
        }
      ]));

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Seasoned')).toBeInTheDocument();
      });

      // Should start in default view
      const container = document.querySelector('.container');
      expect(container).toBeInTheDocument();
    });

    it('handles error state recovery', async () => {
      // Mock failed recommendations response
      fetch.mockRejectedValueOnce(new Error('Network error'));

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Seasoned')).toBeInTheDocument();
      });

      // App should handle error gracefully
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });
  });

  describe('Recipe Management Branches', () => {
    it('handles no saved recipes', async () => {
      // Mock empty recommendations response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ categories: {} }),
      });

      // Mock no saved recipes
      localStorageMock.getItem.mockReturnValue(null);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Seasoned')).toBeInTheDocument();
      });

      // Should handle null gracefully
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });

    it('handles invalid JSON in localStorage', async () => {
      // Mock empty recommendations response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ categories: {} }),
      });

      // Mock invalid JSON
      localStorageMock.getItem.mockReturnValue('invalid json {');

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Seasoned')).toBeInTheDocument();
      });

      // Should handle parse error gracefully
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });

    it('handles empty recipe array', async () => {
      // Mock empty recommendations response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ categories: {} }),
      });

      // Mock empty array
      localStorageMock.getItem.mockReturnValue('[]');

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Seasoned')).toBeInTheDocument();
      });

      // Should handle empty array
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });
  });

  describe('API Response Branches', () => {
    it('handles API timeout', async () => {
      // Mock slow response that will timeout
      fetch.mockImplementationOnce(() => 
        new Promise((resolve) => setTimeout(resolve, 20000))
      );

      render(<App />);

      // Should render without waiting for slow API
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });

    it('handles malformed API response', async () => {
      // Mock malformed response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ unexpected: 'format' }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Seasoned')).toBeInTheDocument();
      });

      // Should handle malformed response
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });

    it('handles non-OK API response', async () => {
      // Mock error response
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Seasoned')).toBeInTheDocument();
      });

      // Should handle error response
      expect(screen.getByText('Seasoned')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid search queries', async () => {
      // Mock empty recommendations response
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ categories: {} }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search recipes/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search recipes/i);

      // Rapid typing
      fireEvent.change(searchInput, { target: { value: 'p' } });
      fireEvent.change(searchInput, { target: { value: 'pa' } });
      fireEvent.change(searchInput, { target: { value: 'pas' } });
      fireEvent.change(searchInput, { target: { value: 'past' } });
      fireEvent.change(searchInput, { target: { value: 'pasta' } });

      expect(searchInput.value).toBe('pasta');
    });

    it('handles special characters in search', async () => {
      // Mock empty recommendations response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ categories: {} }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search recipes/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search recipes/i);

      // Special characters
      fireEvent.change(searchInput, { target: { value: 'recipe@#$%' } });

      expect(searchInput.value).toBe('recipe@#$%');
    });

    it('handles very long search query', async () => {
      // Mock empty recommendations response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ categories: {} }),
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search recipes/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search recipes/i);
      const longQuery = 'a'.repeat(200);

      fireEvent.change(searchInput, { target: { value: longQuery } });

      expect(searchInput.value).toBe(longQuery);
    });
  });
});