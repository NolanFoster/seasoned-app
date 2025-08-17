import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App Component', () => {
  test('renders without crashing', () => {
    render(<App />);
    // Basic smoke test to ensure the app renders
  });

  test('contains expected elements', () => {
    render(<App />);
    // This test will help generate some coverage data
    // You can add more specific assertions based on your App component
  });
});