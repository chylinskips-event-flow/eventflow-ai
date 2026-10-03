import { describe, it, expect } from "vitest";
import {
  buildPollOptions,
  canAskQuestions,
  canRateSession,
  parsePollOptions,
  pollResults,
  publicAuthorName,
  ratingSummary,
  sortQuestions,
  validateQuestionContent,
  type QuestionStatus,
} from "../engagement-core";

describe("validateQuestionContent", () => {
  it("przycina i akceptuje poprawną treść", () => {
    expect(validateQuestionContent("  Jak skalujecie?  ")).toEqual({ ok: true, content: "Jak skalujecie?" });
  });
  it("odrzuca pustą i za długą", () => {
    expect(validateQuestionContent("   ").ok).toBe(false);
    expect(validateQuestionContent(null).ok).toBe(false);
    expect(validateQuestionContent("x".repeat(501)).ok).toBe(false);
  });
});

describe("sortQuestions", () => {
  const q = (id: string, status: QuestionStatus, votes: number, at: string) => ({
    id, status, vote_count: votes, created_at: at,
  });
  it("wyróżnione → otwarte wg głosów (remis: starsze) → odpowiedziane", () => {
    const sorted = sortQuestions([
      q("answered", "answered", 99, "2026-10-01T10:00:00Z"),
      q("low", "pending", 1, "2026-10-01T10:00:00Z"),
      q("top", "pending", 5, "2026-10-01T10:05:00Z"),
      q("tie-new", "pending", 1, "2026-10-01T10:09:00Z"),
      q("selected", "selected", 0, "2026-10-01T10:10:00Z"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["selected", "top", "low", "tie-new", "answered"]);
  });
});

describe("ankiety", () => {
  let n = 0;
  const makeId = () => `o${++n}`;

  it("buduje opcje i odrzuca złe dane", () => {
    expect(buildPollOptions(["Tak", " Nie ", ""], makeId)).toEqual({
      ok: true,
      options: [{ id: "o1", label: "Tak" }, { id: "o2", label: "Nie" }],
    });
    expect(buildPollOptions(["Tylko jedna"], makeId).ok).toBe(false);
    expect(buildPollOptions(["A", "B", "C", "D", "E", "F", "G"], makeId).ok).toBe(false);
    expect(buildPollOptions(["Tak", "tak"], makeId).ok).toBe(false);
  });

  it("parsePollOptions pomija niepoprawne wpisy", () => {
    expect(parsePollOptions([{ id: "a", label: "A" }, { id: 1 }, null, "x"])).toEqual([{ id: "a", label: "A" }]);
    expect(parsePollOptions(null)).toEqual([]);
  });

  it("wyniki z procentami; nieznane opcje ignorowane", () => {
    const { results, total } = pollResults(
      [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
      { a: 3, b: 1, ghost: 10 },
    );
    expect(total).toBe(4);
    expect(results.map((r) => [r.id, r.votes, r.percent])).toEqual([["a", 3, 75], ["b", 1, 25], ["c", 0, 0]]);
  });

  it("brak głosów → 0%", () => {
    expect(pollResults([{ id: "a", label: "A" }], {}).results[0].percent).toBe(0);
  });
});

describe("ratingSummary", () => {
  it("średnia z jednym miejscem po przecinku i rozkład", () => {
    expect(ratingSummary([5, 4, 4, 2, 9, 0])).toEqual({ count: 4, average: 3.8, distribution: [0, 1, 0, 2, 1] });
  });
  it("brak ocen", () => {
    expect(ratingSummary([])).toEqual({ count: 0, average: null, distribution: [0, 0, 0, 0, 0] });
  });
});

describe("kiedy można pytać i oceniać", () => {
  const now = new Date("2026-11-18T10:00:00Z");
  it("pytania: published/live", () => {
    expect(canAskQuestions("published")).toBe(true);
    expect(canAskQuestions("live")).toBe(true);
    expect(canAskQuestions("completed")).toBe(false);
    expect(canAskQuestions("draft")).toBe(false);
  });
  it("ocena: po starcie sesji lub po zakończeniu eventu", () => {
    expect(canRateSession({ starts_at: "2026-11-18T09:00:00Z" }, "live", now)).toBe(true);
    expect(canRateSession({ starts_at: "2026-11-18T11:00:00Z" }, "live", now)).toBe(false);
    expect(canRateSession({ starts_at: "2026-11-18T11:00:00Z" }, "completed", now)).toBe(true);
    expect(canRateSession({ starts_at: null }, "live", now)).toBe(true);
    expect(canRateSession({ starts_at: null }, "published", now)).toBe(false);
    expect(canRateSession({ starts_at: "2026-11-18T09:00:00Z" }, "draft", now)).toBe(false);
  });
});

describe("publicAuthorName", () => {
  const a = { first_name: "Anna", last_name: "Nowak", company: "ACME" };
  it("imię + inicjał nazwiska + firma; anonimowe → null", () => {
    expect(publicAuthorName(false, a)).toBe("Anna N. · ACME");
    expect(publicAuthorName(true, a)).toBeNull();
    expect(publicAuthorName(false, { first_name: "Jan", last_name: null, company: null })).toBe("Jan");
  });
});
