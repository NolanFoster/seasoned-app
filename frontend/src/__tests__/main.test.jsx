import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App';

// Mock ReactDOM.createRoot
jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({
    render: jest.fn(),
  })),
}));

// Mock App component
jest.mock('../App', () => {
  return function MockedApp() {
    return <div>Mocked App</div>;
  };
});

describe('main.jsx', () => {
  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();
    
    // Create a root element
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    // Clean up
    document.body.innerHTML = '';
  });

  test('renders App component in StrictMode', () => {
    // Import main.jsx which will execute the render
    require('../main');

    // Check that createRoot was called with the root element
    expect(ReactDOM.createRoot).toHaveBeenCalledWith(
      document.getElementById('root')
    );

    // Check that render was called
    const mockRoot = ReactDOM.createRoot.mock.results[0].value;
    expect(mockRoot.render).toHaveBeenCalledWith(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
});