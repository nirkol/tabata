import { describe, expect, it } from 'vitest';
import { formatClock, formatCountdown, parseInteger, parseTime } from './format';

describe('formatClock', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(17)).toBe('0:17');
    expect(formatClock(150)).toBe('2:30');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('formatCountdown', () => {
  it('rounds up so the last second shows 0:01, not 0:00', () => {
    expect(formatCountdown(5000)).toBe('0:05');
    expect(formatCountdown(4999)).toBe('0:05');
    expect(formatCountdown(4000)).toBe('0:04');
    expect(formatCountdown(1)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});

describe('parseTime (SPEC §5.3)', () => {
  it('accepts m:ss and plain seconds', () => {
    expect(parseTime('1:30')).toBe(90);
    expect(parseTime('0:05')).toBe(5);
    expect(parseTime('10:00')).toBe(600);
    expect(parseTime('90')).toBe(90);
    expect(parseTime(' 20 ')).toBe(20);
    expect(parseTime('1:5')).toBe(65);
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'abc', '1:60', '1:', ':30', '1.5', '-5', '1:30:00', '1e3']) {
      expect(parseTime(bad), bad).toBeNull();
    }
  });
});

describe('parseInteger', () => {
  it('accepts whole numbers only', () => {
    expect(parseInteger('8')).toBe(8);
    expect(parseInteger('')).toBeNull();
    expect(parseInteger('2.5')).toBeNull();
    expect(parseInteger('x')).toBeNull();
  });
});
