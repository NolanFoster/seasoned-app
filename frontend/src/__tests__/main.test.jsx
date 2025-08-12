import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App';

// Mock ReactDOM.createRoot
jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({
    render: jest.fn()
  }))
}));

// Mock the App component
jest.mock('../App', () => ({
  __esModule: true,
  default: jest.fn(() => null)
}));

// Mock CSS import
jest.mock('../index.css', () => ({}));

describe('main.jsx', () => {
  let rootElement;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create a mock root element
    rootElement = document.createElement('div');
    rootElement.id = 'root';
    document.body.appendChild(rootElement);
  });

  afterEach(() => {
    // Clean up
    document.body.removeChild(rootElement);
  });

  test('renders App component in StrictMode', () => {
    // Import main.jsx which will execute the rendering
    require('../main.jsx');

    // Check that createRoot was called with the root element
    expect(ReactDOM.createRoot).toHaveBeenCalledWith(rootElement);

    // Get the render function from the mock
    const mockRoot = ReactDOM.createRoot.mock.results[0].value;

    // Check that render was called
    expect(mockRoot.render).toHaveBeenCalledTimes(1);

    // Check that App was rendered inside StrictMode
    const renderCall = mockRoot.render.mock.calls[0][0];
    expect(renderCall.type).toBe(React.StrictMode);
    expect(renderCall.props.children.type).toBe(App);
  });

  test('finds root element by id', () => {
    // Spy on getElementById
    const getElementByIdSpy = jest.spyOn(document, 'getElementById');

    // Import main.jsx
    require('../main.jsx');

    // Check that getElementById was called with 'root'
    expect(getElementByIdSpy).toHaveBeenCalledWith('root');

    getElementByIdSpy.mockRestore();
  });
});