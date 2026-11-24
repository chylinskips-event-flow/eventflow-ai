import { describe, it, expect } from "vitest";
import { formatLastSeats, pluralizePl } from "@/lib/format";

// Odmiana „Ostatnie N miejsc(a)” na stronie wydarzenia: 1 miejsce, 2–4 miejsca, 5+ miejsc,
// 12–14 miejsc, 22–24 miejsca.

describe("formatLastSeats", () => {
  it.each([
    [1, "Ostatnie miejsce"],
    [2, "Ostatnie 2 miejsca"],
    [4, "Ostatnie 4 miejsca"],
    [5, "Ostatnie 5 miejsc"],
    [10, "Ostatnie 10 miejsc"],
    [12, "Ostatnie 12 miejsc"],
    [14, "Ostatnie 14 miejsc"],
    [21, "Ostatnie 21 miejsc"],
    [22, "Ostatnie 22 miejsca"],
    [24, "Ostatnie 24 miejsca"],
  ])("%i → %s", (n, label) => {
    expect(formatLastSeats(n)).toBe(label);
  });

  it("pluralizePl: 0 i 112 w dopełniaczu, 102 w mianowniku l.mn.", () => {
    const forms: [string, string, string] = ["miejsce", "miejsca", "miejsc"];
    expect(pluralizePl(0, forms)).toBe("miejsc");
    expect(pluralizePl(112, forms)).toBe("miejsc");
    expect(pluralizePl(102, forms)).toBe("miejsca");
  });
});
