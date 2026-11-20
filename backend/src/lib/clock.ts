/** 可注入的時鐘：正式環境用系統時間，測試可用假時鐘推進時間（research.md R12）。 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** 測試用時鐘。 */
export class FakeClock implements Clock {
  private current: number;

  constructor(start: Date | string = "2026-11-20T08:00:00.000Z") {
    this.current = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
