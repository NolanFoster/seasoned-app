import React from 'react';

// Mock ReactDOM.createRoot since we're testing the main entry point
const mockRender = jest.fn();
const mockCreateRoot = jest.fn(() => ({
  render: mockRender,
}));

jest.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot,
}));

// Mock the App component
jest.mock('../App.jsx', () => {
  return function MockApp() {
    return React.createElement('div', { 'data-testid': 'mock-app' }, 'Mock App Component');
  };
});

// Mock SCSS import
jest.mock('../styles/main.scss', () => ({}));

describe('Main Entry Point', () => {
  beforeEach(() => {
    // Clear mocks
    mockCreateRoot.mockClear();
    mockRender.mockClear();
    
    // Mock document.getElementById
    const mockElement = document.createElement('div');
    mockElement.id = 'root';
    jest.spyOn(document, 'getElementById').mockReturnValue(mockElement);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create root and render App component', () => {
    // Import main.jsx to execute the createRoot code
    require('../main.jsx');
    
    // Verify createRoot was called with the root element
    expect(mockCreateRoot).toHaveBeenCalledWith(document.getElementById('root'));
    
    // Verify render was called
    expect(mockRender).toHaveBeenCalled();
    
    // Verify the rendered component structure
    const renderCall = mockRender.mock.calls[0][0];
    expect(renderCall.type).toBe(React.StrictMode);
  });

  it('should import required dependencies', () => {
    // Test that main.jsx imports are working
    expect(() => require('../main.jsx')).not.toThrow();
  });
});