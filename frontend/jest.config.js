module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.svg$': '<rootDir>/__mocks__/svgMock.js',
    '^../../shared/utility-functions.js$': '<rootDir>/__mocks__/utility-functions.js'
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/index.js',
    '!src/reportWebVitals.js',
    '!src/**/*.test.{js,jsx}',
    '!src/**/*.spec.{js,jsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 37,
      functions: 40,
      lines: 50,
      statements: 50,
    },
  },
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx}',
    '<rootDir>/src/**/*.{spec,test}.{js,jsx}'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(starback)/)'
  ],
  globals: {
    'import.meta.env': {
      VITE_API_URL: 'https://test-api.example.com',
      VITE_CLIPPER_API_URL: 'https://test-clipper-api.example.com'
    }
  }
};