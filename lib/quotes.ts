/**
 * Motivational lines shown in the post-check-in celebration (CR-9 / 9a).
 *
 * Every line here is original text written for Spotter — deliberately NOT
 * famous quotations, so there is no attribution or copyright question. Keep
 * them short (one screen line on a phone) and gym-agnostic.
 *
 * The count is prime, which lets `pickQuote` walk the list with a fixed
 * co-prime stride and guarantee no repeat inside a seven-day window.
 */
export const QUOTES: readonly string[] = [
  "You showed up. That is the rep that counts most.",
  "Small sessions stack into a strong year.",
  "The hardest step was through the door, and you took it.",
  "Consistency is just showing up before you feel ready.",
  "Today's effort is tomorrow's baseline.",
  "Your streak is a promise you keep to yourself.",
  "Progress hides in the days you almost skipped.",
  "Strong is built one ordinary visit at a time.",
  "You did not wait for motivation. You just came.",
  "Every check-in is a vote for the person you are becoming.",
  "Momentum likes people who keep the appointment.",
  "The gym forgets your excuses and remembers your habits.",
  "One more day on the board. Keep it lit.",
  "Discipline carried you here while comfort stayed home.",
  "You are not starting over. You are continuing.",
  "The body keeps score, and today you scored.",
  "Turning up tired still beats staying home rested.",
  "Habits are quiet until one day they are your whole strength.",
  "Future you just sent a thank-you note.",
  "Skip the debate, keep the streak.",
  "A short workout done beats a perfect one imagined.",
  "You are becoming hard to stop.",
  "The plan only works on the days you work it. Today it worked.",
  "Rest days are earned, and you are earning yours.",
  "Nobody regrets the session they finished.",
  "Show up on the flat days and the peaks take care of themselves.",
  "Your streak does not care how you felt in the car park.",
  "Another brick laid. The wall is getting tall.",
  "You kept the chain unbroken. That is the whole game.",
] as const;

const STRIDE = 9; // co-prime with QUOTES.length (29)
const WEEK_SHIFT = 11; // co-prime with QUOTES.length (29)

/**
 * Deterministically pick a quote for `seed`. `seed` is a day number — either an
 * integer count of days, or a `YYYY-MM-DD` string which is converted to one.
 *
 * Seven consecutive day-seeds land inside one `floor(seed / 7)` week bucket and
 * are guaranteed distinct (fixed co-prime stride over a prime-length list), so
 * a member never sees the same line twice in a week.
 */
export function pickQuote(seed: number | string): string {
  const n = QUOTES.length;

  let day: number;
  if (typeof seed === "number") {
    day = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  } else {
    const ms = Date.parse(`${seed}T00:00:00Z`);
    day = Number.isNaN(ms) ? 0 : Math.floor(ms / 86_400_000);
  }

  const week = Math.floor(day / 7);
  const pos = ((day % 7) + 7) % 7;
  const offset = (((week * WEEK_SHIFT) % n) + n) % n;
  const index = (offset + pos * STRIDE) % n;
  return QUOTES[index]!;
}
