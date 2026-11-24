/** Clock（類別圖 001-class）：所有與時間有關的邏輯都透過注入的時鐘取得現在時間，方便測試。 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export interface FakeClock extends Clock {
  advance(ms: number): void;
  set(date: Date): void;
}

/** 測試用假時鐘：時間只會在呼叫 advance／set 時改變。 */
export function createFakeClock(start: Date = new Date('2026-01-05T08:00:00.000Z')): FakeClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance(ms: number) {
      current += ms;
    },
    set(date: Date) {
      current = date.getTime();
    },
  };
}
