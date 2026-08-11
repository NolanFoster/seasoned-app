// Minimums come from .github/coverage-thresholds.json so local runs and the
// pull request coverage gate enforce the same numbers.
const policy = require('../.github/coverage-thresholds.json');

const { lines, statements, functions, branches } = {
  ...policy.defaults,
  ...policy.packages['recipe-app'].thresholds
};

module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  transformIgnorePatterns: [
    '/node_modules/(?!@hello-pangea/dnd)'
  ],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx}',
    '<rootDir>/src/**/*.{spec,test}.{js,jsx}'
  ],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/main.jsx'
  ],
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: { lines, statements, functions, branches }
  }
};
