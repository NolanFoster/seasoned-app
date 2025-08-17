import React from 'react';
import ReactDOM from 'react-dom/client';
import './setupTests'; // Ensure setup runs first

// Mock ReactDOM.createRoot
const mockRender = jest.fn();
const mockCreateRoot = jest.fn(() => ({ render: mockRender }));
ReactDOM.createRoot = mockCreateRoot;

// Mock the App component
jest.mock('./App.jsx', () => {
  return function App() {
    return <div>Mocked App</div>;
  };
});

describe('main.jsx', () => {
  let rootElement;

  beforeEach(() => {
    // Clear mocks
    mockRender.mockClear();
    mockCreateRoot.mockClear();
    
    // Create a root element
    rootElement = document.createElement('div');
    rootElement.id = 'root';
    document.body.appendChild(rootElement);
  });

  afterEach(() => {
    // Clean up
    document.body.innerHTML = '';
  });

  it('should render App component into root element', () => {
    // Import main.jsx (this will execute the code)
    require('./main.jsx');

    // Verify createRoot was called with the root element
    expect(mockCreateRoot).toHaveBeenCalledWith(rootElement);

    // Verify render was called
    expect(mockRender).toHaveBeenCalled();

    // Check that React.StrictMode and App were rendered
    const renderCall = mockRender.mock.calls[0][0];
    expect(renderCall.type).toBe(React.StrictMode);
    expect(renderCall.props.children.type.name).toBe('App');
  });
});