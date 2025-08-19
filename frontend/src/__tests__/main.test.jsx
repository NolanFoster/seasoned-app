import React from "react";

// Mock ReactDOM.createRoot
jest.mock("react-dom/client", () => ({
  createRoot: jest.fn(() => ({
    render: jest.fn(),
  })),
}));

// Mock App component
jest.mock("../App.jsx", () => {
  return function MockApp() {
    return React.createElement("div", { "data-testid": "mock-app" }, "Mock App");
  };
});

describe("Main Entry Point", () => {
  it("should render without crashing", () => {
    require("../main.jsx");
    expect(true).toBe(true);
  });
});