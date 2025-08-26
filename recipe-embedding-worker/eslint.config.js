import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        URL: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        DecompressionStream: 'readonly',
        CompressionStream: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        atob: 'readonly',
        btoa: 'readonly'
      }
    },
    rules: {
      'indent': ['error', 2],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
      'no-console': 'warn',
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'arrow-spacing': 'error',
      'comma-dangle': ['error', 'never'],
      'eol-last': 'error',
      'no-trailing-spaces': 'error',
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never']
    }
  },
  {
    files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        getMockEnv: 'readonly',
        getMockCorsHeaders: 'readonly',
        createMockRequest: 'readonly',
        parseResponse: 'readonly'
      }
    },
    rules: {
      'no-console': 'off'
    }
  },
  {
    ignores: [
      'node_modules/',
      'coverage/',
      'dist/',
      '*.config.js'
    ]
  }
];
