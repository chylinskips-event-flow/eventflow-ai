import { describe, expect, it } from "vitest";
import {
  buyerNameParts,
  computeDiscountAmount,
  hasDiscountUsesLeft,
  initialAttendeeStatus,
  isWithinWindow,
  splitFullName,
  totalAfterDiscount,
} from "@/lib/checkout-core";
import { buildOrderOverbookedEmail } from "@/lib/email/order-overbooked";

describe("rabat i kwota do zapłaty", () => {
  it("kod 100% daje 0 zł (zamówienie bez płatności)", () => {
    const d = computeDiscountAmount(4999, { kind: "percent", value: 100 });
    expect(d).toBe(4999);
    expect(totalAfterDiscount(4999, d)).toBe(0);
  });

  it("rabat kwotowy większy niż cena jest przycinany do ceny", () => {
    const d = computeDiscountAmount(3000, { kind: "amount", value: 5000 });
    expect(d).toBe(3000);
    expect(totalAfterDiscount(3000, d)).toBe(0);
  });

  it("rabat procentowy zaokrąglany w dół", () => {
    expect(computeDiscountAmount(4999, { kind: "percent", value: 20 })).toBe(999);
    expect(totalAfterDiscount(4999, 999)).toBe(4000);
  });
});

describe("limit użyć kodu", () => {
  it("bez limitu zawsze dostępny", () => {
    expect(hasDiscountUsesLeft({ max_uses: null, uses_count: 1000 }, 50)).toBe(true);
  });

  it("liczy potwierdzone użycia i trwające płatności", () => {
    expect(hasDiscountUsesLeft({ max_uses: 3, uses_count: 1 }, 1)).toBe(true);
    expect(hasDiscountUsesLeft({ max_uses: 3, uses_count: 2 }, 1)).toBe(false);
    expect(hasDiscountUsesLeft({ max_uses: 3, uses_count: 3 }, 0)).toBe(false);
  });
});

describe("imię i nazwisko kupującego", () => {
  it("jeden napis: pierwszy wyraz to imię, reszta to nazwisko", () => {
    expect(splitFullName("Anna Maria Kowalska-Nowak")).toEqual({
      firstName: "Anna",
      lastName: "Maria Kowalska-Nowak",
    });
    expect(splitFullName("  Jan   Nowak ")).toEqual({ firstName: "Jan", lastName: "Nowak" });
    expect(splitFullName("Cher")).toEqual({ firstName: "Cher", lastName: "-" });
  });

  it("osobne pola z formularza mają pierwszeństwo przed podziałem", () => {
    expect(
      buyerNameParts({
        buyer_name: "Anna Maria Kowalska-Nowak",
        buyer_first_name: "Anna Maria",
        buyer_last_name: "Kowalska-Nowak",
      }),
    ).toEqual({ firstName: "Anna Maria", lastName: "Kowalska-Nowak" });
  });

  it("starsze zamówienie bez osobnych pól: podział jednego napisu", () => {
    expect(buyerNameParts({ buyer_name: "Anna Maria Kowalska-Nowak", buyer_first_name: null })).toEqual({
      firstName: "Anna",
      lastName: "Maria Kowalska-Nowak",
    });
  });
});

describe("status uczestnika z kasy", () => {
  it("wydarzenie z zatwierdzaniem → pending, bez → approved", () => {
    expect(initialAttendeeStatus(true)).toBe("pending");
    expect(initialAttendeeStatus(false)).toBe("approved");
  });
});

describe("okno sprzedaży / ważności", () => {
  const now = new Date("2026-11-20T10:00:00.000Z");
  it("porównuje instanty niezależnie od zapisu strefy", () => {
    expect(isWithinWindow("2026-11-20T10:30:00+00:00", null, now)).toBe("before");
    expect(isWithinWindow(null, "2026-11-20T10:30:00+01:00", now)).toBe("after");
    expect(isWithinWindow("2026-11-20T10:30:00+01:00", "2026-11-21T00:00:00Z", now)).toBe("open");
    expect(isWithinWindow(null, null, now)).toBe("open");
  });
});

describe("powiadomienie organizatora o płatności bez miejsca", () => {
  it("zawiera dane zamówienia i escapuje HTML", () => {
    const { subject, html } = buildOrderOverbookedEmail({
      eventName: "Konf <b>",
      buyerName: "Anna Nowak",
      buyerEmail: "anna@example.com",
      amount: 4999,
      currency: "PLN",
      sessionId: "p24_abc",
      p24OrderId: "123",
    });
    expect(subject).toContain("Konf <b>");
    expect(html).toContain("Konf &lt;b&gt;");
    expect(html).toContain("anna@example.com");
    expect(html).toContain("49,99 PLN");
    expect(html).toContain("123");
    expect(html).toContain("Bilet nie został wystawiony");
  });
});
