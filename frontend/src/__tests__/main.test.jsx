import React from "react";
import ReactDOM from "react-dom/client";

// Mock ReactDOM.createRoot
const mockRender = jest.fn();
const mockCreateRoot = jest.fn(() => ({
  render: mockRender,
}));

jest.mock("react-dom/client", () => ({
  createRoot: jest.fn(() => ({
    render: jest.fn(),
  })),
}));

// Mock App component
jest.mock("../App.jsx", () => {
  const mockReact = require("react");
  return function MockApp() {
    return mockReact.createElement("div", { "data-testid": "mock-app" }, "Mock App");
  };
});

// Mock the styles import
jest.mock("../styles/main.scss", () => ({}));

describe("Main Entry Point", () => {
  beforeEach(() => {
    // Clear mocks before each test
    jest.clearAllMocks();
    
    // Create a mock root element
    const rootElement = document.createElement("div");
    rootElement.id = "root";
    document.body.appendChild(rootElement);
  });

  afterEach(() => {
    // Clean up the DOM
    document.body.innerHTML = "";
  });

  it("should create root and render App component", () => {
    // Import main.jsx which will execute the code
    require("../main.jsx");

    // Get the mocked createRoot function
    const createRootMock = require("react-dom/client").createRoot;
    
    // Verify createRoot was called with the root element
    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledWith(document.getElementById("root"));

    // Verify render was called on the created root
    const rootInstance = createRootMock.mock.results[0].value;
    expect(rootInstance.render).toHaveBeenCalledTimes(1);
    
    // Verify the rendered component structure
    const renderCall = rootInstance.render.mock.calls[0][0];
    expect(renderCall.type).toBe(React.StrictMode);
    expect(renderCall.props.children.type.name).toBe("MockApp");
  });

  it("should call createRoot with null when root element is missing", () => {
    // Remove the root element
    document.body.innerHTML = "";

    // Clear previous mocks
    jest.resetModules();
    jest.clearAllMocks();
    
    // Import main.jsx which will execute the code
    require("../main.jsx");
    
    // Get the mocked createRoot function
    const createRootMock = require("react-dom/client").createRoot;
    
    // Verify createRoot was called with null (since getElementById returns null)
    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledWith(null);
  });
});