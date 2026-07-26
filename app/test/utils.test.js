const { isValidEmail } = require('../utils');

test('accepts a valid email', () => {
  expect(isValidEmail('prathip@example.com')).toBe(true);
});

test('rejects an invalid email', () => {
  expect(isValidEmail('not-an-email')).toBe(false);
});

test('rejects an empty string', () => {
  expect(isValidEmail('')).toBe(false);
});
