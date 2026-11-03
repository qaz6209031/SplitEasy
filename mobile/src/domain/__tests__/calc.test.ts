import { applyKey, evaluateCents, hasOperator, spaced, type CalcKey } from '../calc';

const type = (keys: string, start = '', fresh = false) =>
  [...keys].reduce((expr, k, i) => applyKey(expr, (k === '<' ? 'del' : k) as CalcKey, fresh && i === 0), start);

describe('applyKey', () => {
  it('builds numbers and expressions', () => {
    expect(type('12.5+8×2')).toBe('12.5+8×2');
  });
  it('limits each number to two decimals and one point', () => {
    expect(type('1.234')).toBe('1.23');
    expect(type('1..5')).toBe('1.5');
    expect(type('1.25+3.456')).toBe('1.25+3.45');
  });
  it('starts a bare point with a zero', () => {
    expect(type('.5')).toBe('0.5');
    expect(type('3+.5')).toBe('3+0.5');
  });
  it('drops leading zeros', () => {
    expect(type('007')).toBe('7');
    expect(type('5+05')).toBe('5+5');
  });
  it('ignores an operator first, and replaces a repeated one', () => {
    expect(type('+5')).toBe('5');
    expect(type('5+×3')).toBe('5×3');
    expect(type('5.+')).toBe('5+');
  });
  it('deletes one character at a time', () => {
    expect(type('12+3<<')).toBe('12');
    expect(type('<')).toBe('');
  });
  it('caps the whole-number part', () => {
    expect(type('123456789')).toBe('1234567');
  });
  it('replaces a selected value with a digit, continues it with an operator, clears it with delete', () => {
    expect(type('7', '12.50', true)).toBe('7');
    expect(type('+3', '12.50', true)).toBe('12.50+3');
    expect(type('<', '12.50', true)).toBe('');
  });
});

describe('evaluateCents', () => {
  it('handles the four operations with precedence', () => {
    expect(evaluateCents('12+8.5')).toBe(2050);
    expect(evaluateCents('20−4.25')).toBe(1575);
    expect(evaluateCents('12+8×2')).toBe(2800);
    expect(evaluateCents('100÷4+1')).toBe(2600);
  });
  it('is exact with decimals', () => {
    expect(evaluateCents('0.1+0.2')).toBe(30);
    expect(evaluateCents('19.99×3')).toBe(5997);
  });
  it('rounds to the cent, half up', () => {
    expect(evaluateCents('100÷3')).toBe(3333);
    expect(evaluateCents('0.05÷2')).toBe(3);
    expect(evaluateCents('1.25×1.5')).toBe(188);
  });
  it('ignores a trailing operator or point while typing', () => {
    expect(evaluateCents('12+')).toBe(1200);
    expect(evaluateCents('12.')).toBe(1200);
  });
  it('rejects empty, zero, negative and divide-by-zero', () => {
    expect(evaluateCents('')).toBeNull();
    expect(evaluateCents('0')).toBeNull();
    expect(evaluateCents('5−8')).toBeNull();
    expect(evaluateCents('5÷0')).toBeNull();
  });
  it('accepts plain amounts the same way parseCents does', () => {
    expect(evaluateCents('86.40')).toBe(8640);
    expect(evaluateCents('7')).toBe(700);
  });
});

describe('display helpers', () => {
  it('spaces operators and spots arithmetic', () => {
    expect(spaced('12+8.5×2')).toBe('12 + 8.5 × 2');
    expect(hasOperator('12.50')).toBe(false);
    expect(hasOperator('12+3')).toBe(true);
  });
});
