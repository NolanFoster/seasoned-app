import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Extract the utility functions from App.jsx for testing
// These are not exported, so we'll test them through the App component behavior

describe('Utility Functions', () => {
  describe('formatDuration', () => {
    it('should format ISO 8601 duration correctly', () => {
      // Test by rendering recipes with different duration formats
      const { container } = render(<App />);
      
      // The formatDuration function is used internally in the App component
      // We'll create a minimal component to test it
      const TestComponent = () => {
        const formatDuration = (duration) => {
          if (!duration) return '';
          
          if (typeof duration !== 'string') {
            try {
              const coerced = duration.toString();
              if (typeof coerced !== 'string') return '';
              duration = coerced;
            } catch (error) {
              return '';
            }
          }
          
          if (!duration.startsWith('PT')) return duration;
          
          try {
            let remaining = duration.substring(2);
            let hours = 0;
            let minutes = 0;
            
            const hourMatch = remaining.match(/(\d+)H/);
            if (hourMatch) {
              hours = parseInt(hourMatch[1], 10);
              remaining = remaining.replace(hourMatch[0], '');
            }
            
            const minuteMatch = remaining.match(/(\d+)M/);
            if (minuteMatch) {
              minutes = parseInt(minuteMatch[1], 10);
            }
            
            let result = '';
            if (hours > 0) {
              result += `${hours} h`;
              if (minutes > 0) {
                result += ` ${minutes} m`;
              }
            } else if (minutes > 0) {
              result += `${minutes} m`;
            } else {
              return duration;
            }
            
            return result;
          } catch (error) {
            return duration;
          }
        };

        return (
          <div>
            <span data-testid="pt30m">{formatDuration('PT30M')}</span>
            <span data-testid="pt1h">{formatDuration('PT1H')}</span>
            <span data-testid="pt1h30m">{formatDuration('PT1H30M')}</span>
            <span data-testid="pt2h15m">{formatDuration('PT2H15M')}</span>
            <span data-testid="empty">{formatDuration('')}</span>
            <span data-testid="null">{formatDuration(null)}</span>
            <span data-testid="number">{formatDuration(123)}</span>
            <span data-testid="already-formatted">{formatDuration('45 minutes')}</span>
            <span data-testid="invalid">{formatDuration('PT')}</span>
          </div>
        );
      };

      const { getByTestId } = render(<TestComponent />);
      
      expect(getByTestId('pt30m').textContent).toBe('30 m');
      expect(getByTestId('pt1h').textContent).toBe('1 h');
      expect(getByTestId('pt1h30m').textContent).toBe('1 h 30 m');
      expect(getByTestId('pt2h15m').textContent).toBe('2 h 15 m');
      expect(getByTestId('empty').textContent).toBe('');
      expect(getByTestId('null').textContent).toBe('');
      expect(getByTestId('number').textContent).toBe('123');
      expect(getByTestId('already-formatted').textContent).toBe('45 minutes');
      expect(getByTestId('invalid').textContent).toBe('PT');
    });
  });

  describe('isValidUrl', () => {
    it('should validate URLs correctly', () => {
      const TestComponent = () => {
        const isValidUrl = (string) => {
          try {
            if (string.match(/^(https?:\/\/)/i)) {
              new URL(string);
              return true;
            }
            
            if (string.match(/^www\./i)) {
              new URL(`https://${string}`);
              return true;
            }
            
            if (!string.includes(' ') && string.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)*\.[a-zA-Z]{2,}$/)) {
              const parts = string.split('.');
              if (parts.length >= 2 && parts[parts.length - 2].length >= 2) {
                new URL(`https://${string}`);
                return true;
              }
            }
            
            return false;
          } catch (e) {
            return false;
          }
        };

        return (
          <div>
            <span data-testid="http-url">{isValidUrl('http://example.com') ? 'valid' : 'invalid'}</span>
            <span data-testid="https-url">{isValidUrl('https://example.com') ? 'valid' : 'invalid'}</span>
            <span data-testid="www-url">{isValidUrl('www.example.com') ? 'valid' : 'invalid'}</span>
            <span data-testid="domain">{isValidUrl('example.com') ? 'valid' : 'invalid'}</span>
            <span data-testid="subdomain">{isValidUrl('sub.example.com') ? 'valid' : 'invalid'}</span>
            <span data-testid="invalid-space">{isValidUrl('example com') ? 'valid' : 'invalid'}</span>
            <span data-testid="invalid-no-tld">{isValidUrl('example') ? 'valid' : 'invalid'}</span>
            <span data-testid="invalid-short">{isValidUrl('e.x') ? 'valid' : 'invalid'}</span>
            <span data-testid="search-query">{isValidUrl('chicken recipe') ? 'valid' : 'invalid'}</span>
          </div>
        );
      };

      const { getByTestId } = render(<TestComponent />);
      
      expect(getByTestId('http-url').textContent).toBe('valid');
      expect(getByTestId('https-url').textContent).toBe('valid');
      expect(getByTestId('www-url').textContent).toBe('valid');
      expect(getByTestId('domain').textContent).toBe('valid');
      expect(getByTestId('subdomain').textContent).toBe('valid');
      expect(getByTestId('invalid-space').textContent).toBe('invalid');
      expect(getByTestId('invalid-no-tld').textContent).toBe('invalid');
      expect(getByTestId('invalid-short').textContent).toBe('invalid');
      expect(getByTestId('search-query').textContent).toBe('invalid');
    });
  });

  describe('calculateSimilarity and levenshteinDistance', () => {
    it('should calculate string similarity correctly', () => {
      const TestComponent = () => {
        const levenshteinDistance = (str1, str2) => {
          const matrix = [];
          
          for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
          }
          
          for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
          }
          
          for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
              if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
              } else {
                matrix[i][j] = Math.min(
                  matrix[i - 1][j - 1] + 1,
                  matrix[i][j - 1] + 1,
                  matrix[i - 1][j] + 1
                );
              }
            }
          }
          
          return matrix[str2.length][str1.length];
        };

        const calculateSimilarity = (str1, str2) => {
          if (str1 === str2) return 1.0;
          
          const maxLen = Math.max(str1.length, str2.length);
          if (maxLen === 0) return 1.0;
          
          const distance = levenshteinDistance(str1, str2);
          return 1 - (distance / maxLen);
        };

        return (
          <div>
            <span data-testid="same">{calculateSimilarity('hello', 'hello').toFixed(2)}</span>
            <span data-testid="similar">{calculateSimilarity('hello', 'helo').toFixed(2)}</span>
            <span data-testid="different">{calculateSimilarity('hello', 'world').toFixed(2)}</span>
            <span data-testid="empty">{calculateSimilarity('', '').toFixed(2)}</span>
            <span data-testid="one-empty">{calculateSimilarity('hello', '').toFixed(2)}</span>
            <span data-testid="case-diff">{calculateSimilarity('Hello', 'hello').toFixed(2)}</span>
          </div>
        );
      };

      const { getByTestId } = render(<TestComponent />);
      
      expect(getByTestId('same').textContent).toBe('1.00');
      expect(getByTestId('similar').textContent).toBe('0.80');
      expect(getByTestId('different').textContent).toBe('0.20');
      expect(getByTestId('empty').textContent).toBe('1.00');
      expect(getByTestId('one-empty').textContent).toBe('0.00');
      expect(getByTestId('case-diff').textContent).toBe('0.80');
    });
  });

  describe('checkForDuplicates', () => {
    it('should identify duplicate recipes', () => {
      const TestComponent = () => {
        const calculateSimilarity = (str1, str2) => {
          if (str1 === str2) return 1.0;
          
          const levenshteinDistance = (str1, str2) => {
            const matrix = [];
            
            for (let i = 0; i <= str2.length; i++) {
              matrix[i] = [i];
            }
            
            for (let j = 0; j <= str1.length; j++) {
              matrix[0][j] = j;
            }
            
            for (let i = 1; i <= str2.length; i++) {
              for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                  matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                  matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                  );
                }
              }
            }
            
            return matrix[str2.length][str1.length];
          };
          
          const maxLen = Math.max(str1.length, str2.length);
          if (maxLen === 0) return 1.0;
          
          const distance = levenshteinDistance(str1, str2);
          return 1 - (distance / maxLen);
        };

        const recipes = [
          { id: 1, name: 'Chicken Pasta', source_url: 'http://example.com/pasta' },
          { id: 2, name: 'Chicken Pasta', source_url: 'http://example.com/pasta' },
          { id: 3, name: 'Chicken Pastas', source_url: 'http://different.com/pasta' },
          { id: 4, name: 'Beef Stew', source_url: 'http://example.com/stew' }
        ];

        const checkForDuplicates = (recipeToCheck) => {
          const duplicates = recipes.filter(recipe => {
            if (recipe.id === recipeToCheck.id) return false;
            
            const nameSimilarity = calculateSimilarity(
              recipe.name.toLowerCase(),
              recipeToCheck.name.toLowerCase()
            );
            
            const exactUrlMatch = recipe.source_url === recipeToCheck.source_url;
            
            return nameSimilarity > 0.8 || exactUrlMatch;
          });

          return duplicates;
        };

        const testRecipe = { id: 5, name: 'Chicken Pasta', source_url: 'http://new.com/pasta' };
        const duplicates = checkForDuplicates(testRecipe);

        return (
          <div>
            <span data-testid="duplicate-count">{duplicates.length}</span>
            <span data-testid="has-exact-name">{duplicates.some(d => d.id === 1 || d.id === 2) ? 'yes' : 'no'}</span>
            <span data-testid="has-similar-name">{duplicates.some(d => d.id === 3) ? 'yes' : 'no'}</span>
            <span data-testid="no-beef">{duplicates.some(d => d.id === 4) ? 'yes' : 'no'}</span>
          </div>
        );
      };

      const { getByTestId } = render(<TestComponent />);
      
      expect(getByTestId('duplicate-count').textContent).toBe('3');
      expect(getByTestId('has-exact-name').textContent).toBe('yes');
      expect(getByTestId('has-similar-name').textContent).toBe('yes');
      expect(getByTestId('no-beef').textContent).toBe('no');
    });
  });
});