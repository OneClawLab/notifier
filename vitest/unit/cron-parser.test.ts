import { describe, it, expect } from 'vitest';
import { parseCron, describeCron, cronHasSeconds } from '../../src/cron-parser.js';

// Helper: build a Date in local time from explicit components
function localDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  return new Date(year, month - 1, day, hour, minute, second, 0);
}

describe('parseCron', () => {
  describe('every minute: * * * * *', () => {
    it('nextTime is now + 1 minute', () => {
      const now = localDate(2024, 6, 15, 10, 30, 0);
      const result = parseCron('* * * * *', now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expected = localDate(2024, 6, 15, 10, 31, 0);
      expect(result.value.nextTime.getTime()).toBe(expected.getTime());
    });
  });

  describe('weekdays at 9am: 0 9 * * 1-5', () => {
    it('nextTime is same day at 09:00 when now is before 09:00 on a weekday', () => {
      // 2024-06-17 is a Monday; 08:00 local → next trigger same day 09:00 local
      const now = localDate(2024, 6, 17, 8, 0, 0);
      expect(now.getDay()).toBe(1); // Monday
      const result = parseCron('0 9 * * 1-5', now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expected = localDate(2024, 6, 17, 9, 0, 0);
      expect(result.value.nextTime.getTime()).toBe(expected.getTime());
    });

    it('nextTime skips weekend when now is Friday after 09:00', () => {
      // 2024-06-21 is a Friday; 10:00 local → next trigger is Monday 2024-06-24 09:00 local
      const now = localDate(2024, 6, 21, 10, 0, 0);
      expect(now.getDay()).toBe(5); // Friday
      const result = parseCron('0 9 * * 1-5', now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expected = localDate(2024, 6, 24, 9, 0, 0);
      expect(result.value.nextTime.getTime()).toBe(expected.getTime());
    });
  });

  describe('2:30pm on 1st of month: 30 14 1 * *', () => {
    it('nextTime is the 1st of the next month at 14:30 when now is past the 1st', () => {
      // 2024-06-15 → next trigger is 2024-07-01 at 14:30 local
      const now = localDate(2024, 6, 15, 0, 0, 0);
      const result = parseCron('30 14 1 * *', now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expected = localDate(2024, 7, 1, 14, 30, 0);
      expect(result.value.nextTime.getTime()).toBe(expected.getTime());
    });

    it('nextTime is today at 14:30 when now is the 1st before 14:30', () => {
      const now = localDate(2024, 7, 1, 10, 0, 0);
      const result = parseCron('30 14 1 * *', now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expected = localDate(2024, 7, 1, 14, 30, 0);
      expect(result.value.nextTime.getTime()).toBe(expected.getTime());
    });
  });

  describe('nextTime is always > now', () => {
    it('nextTime strictly greater than now for * * * * *', () => {
      const now = localDate(2024, 6, 15, 10, 30, 45);
      const result = parseCron('* * * * *', now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.nextTime.getTime()).toBeGreaterThan(now.getTime());
    });

    it('nextTime strictly greater than now when now is exactly at a trigger time', () => {
      // now is exactly at 09:00 on a Monday — next trigger must be strictly after
      const now = localDate(2024, 6, 17, 9, 0, 0);
      const result = parseCron('0 9 * * 1-5', now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.nextTime.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('invalid field count', () => {
    it('returns ok: false for 4 fields', () => {
      const result = parseCron('* * * *');
      expect(result.ok).toBe(false);
    });

    it('returns ok: false for 7 fields', () => {
      const result = parseCron('* * * * * * *');
      expect(result.ok).toBe(false);
    });

    it('accepts 6 fields (second-level cron)', () => {
      const result = parseCron('0 * * * * *');
      expect(result.ok).toBe(true);
    });
  });

  describe('invalid field values', () => {
    it('returns error containing "minute" for minute=60', () => {
      const result = parseCron('60 * * * *');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.toLowerCase()).toContain('minute');
    });

    it('returns error containing "hour" for hour=24', () => {
      const result = parseCron('* 24 * * *');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.toLowerCase()).toContain('hour');
    });

    it('returns error containing "month" for month=13', () => {
      const result = parseCron('* * * 13 *');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.toLowerCase()).toContain('month');
    });
  });
});

describe('6-field (second-level) cron', () => {
  it('every second: * * * * * * — nextTime is now + 1s', () => {
    const now = localDate(2024, 6, 15, 10, 30, 5);
    const result = parseCron('* * * * * *', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = localDate(2024, 6, 15, 10, 30, 6);
    expect(result.value.nextTime.getTime()).toBe(expected.getTime());
  });

  it('every 5 seconds: */5 * * * * * — nextTime aligns to next multiple of 5', () => {
    const now = localDate(2024, 6, 15, 10, 30, 7);
    const result = parseCron('*/5 * * * * *', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = localDate(2024, 6, 15, 10, 30, 10);
    expect(result.value.nextTime.getTime()).toBe(expected.getTime());
  });

  it('at second 0 every minute: 0 * * * * * — nextTime is next :00', () => {
    const now = localDate(2024, 6, 15, 10, 30, 5);
    const result = parseCron('0 * * * * *', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = localDate(2024, 6, 15, 10, 31, 0);
    expect(result.value.nextTime.getTime()).toBe(expected.getTime());
  });

  it('nextTime is strictly > now when now is exactly at a trigger second', () => {
    const now = localDate(2024, 6, 15, 10, 30, 10);
    const result = parseCron('*/5 * * * * *', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nextTime.getTime()).toBeGreaterThan(now.getTime());
  });

  it('invalid second value (60) returns error mentioning "second"', () => {
    const result = parseCron('60 * * * * *');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain('second');
  });
});

describe('cronHasSeconds', () => {
  it('returns false for 5-field expression', () => {
    expect(cronHasSeconds('* * * * *')).toBe(false);
    expect(cronHasSeconds('0 9 * * 1-5')).toBe(false);
  });

  it('returns true for 6-field expression', () => {
    expect(cronHasSeconds('* * * * * *')).toBe(true);
    expect(cronHasSeconds('*/5 * * * * *')).toBe(true);
  });
});

describe('describeCron', () => {
  it('returns a description string for * * * * *', () => {
    const result = describeCron('* * * * *');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.value).toBe('string');
    expect(result.value.length).toBeGreaterThan(0);
  });

  it('returns a description containing "09:00" or "9" for 0 9 * * 1-5', () => {
    const result = describeCron('0 9 * * 1-5');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatch(/09:00|(?<!\d)9(?!\d)/);
  });

  it('returns ok: false for invalid expression', () => {
    const result = describeCron('* * * *');
    expect(result.ok).toBe(false);
  });
});
