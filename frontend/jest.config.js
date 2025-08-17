module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.svg$': '<rootDir>/__mocks__/svgMock.js'
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
      branches: 50,
      functions: 50,
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
      VITE_CLIPPER_API_URL: 'https://test-clipper-api.example.com',
      VITE_RECOMMENDATION_API_URL: 'https://test-recommendation-api.example.com',
      VITE_SEARCH_DB_URL: 'https://test-search-db.example.com'
    }
  }
};