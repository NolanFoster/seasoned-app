import React from 'react';
import { render } from '@testing-library/react';

// Mock ReactDOM.createRoot since we're testing the main entry point
jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({
    render: jest.fn(),
  })),
}));

// Mock the App component
jest.mock('../App.jsx', () => {
  return function MockApp() {
    return <div data-testid="mock-app">Mock App Component</div>;
  };
});

describe('Main Entry Point', () => {
  it('should render without crashing', () => {
    // Import main.jsx to execute the createRoot code
    require('../main.jsx');
    
    // If we get here without throwing, the main file executed successfully
    expect(true).toBe(true);
  });
});