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
    '!src/**/*.d.ts',
    '!src/index.js',
    '!src/setupTests.js'
  ],
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