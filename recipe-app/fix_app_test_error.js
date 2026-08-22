const fs = require('fs');

let testCode = fs.readFileSync('src/__tests__/App.test.jsx', 'utf8');
testCode = testCode.replace(
  /fireEvent.click\(clearBtn\);\s+expect\(input\.value\)\.toBe\(''\);/,
  `await act(async () => { fireEvent.click(clearBtn); });
    
    expect(input.value).toBe('');`
);
fs.writeFileSync('src/__tests__/App.test.jsx', testCode);

