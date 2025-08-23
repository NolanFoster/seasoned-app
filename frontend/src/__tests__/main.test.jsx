import React from "react";
import ReactDOM from "react-dom/client";

// Mock ReactDOM.createRoot
const mockRender = jest.fn();
const mockCreateRoot = jest.fn(() => ({
  render: mockRender,
}));

jest.mock("react-dom/client", () => ({
  createRoot: mockCreateRoot,
}));

// Mock App component
jest.mock("../App.jsx", () => {
  return function MockApp() {
    return React.createElement("div", { "data-testid": "mock-app" }, "Mock App");
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

    // Verify createRoot was called with the root element
    expect(mockCreateRoot).toHaveBeenCalledTimes(1);
    expect(mockCreateRoot).toHaveBeenCalledWith(document.getElementById("root"));

    // Verify render was called
    expect(mockRender).toHaveBeenCalledTimes(1);
    
    // Verify the rendered component structure
    const renderCall = mockRender.mock.calls[0][0];
    expect(renderCall.type).toBe(React.StrictMode);
    expect(renderCall.props.children.type.name).toBe("MockApp");
  });

  it("should handle missing root element gracefully", () => {
    // Remove the root element
    document.body.innerHTML = "";

    // This should throw or handle the error
    expect(() => {
      jest.resetModules();
      require("../main.jsx");
    }).toThrow();
  });
});