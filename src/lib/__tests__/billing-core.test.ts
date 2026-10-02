import { describe, it, expect } from "vitest";
import {
  mapStripeStatus,
  planKeyForPrice,
  resolvePriceId,
  shouldApplySubscription,
  type PlanPriceRow,
} from "../billing-core";

const plans: PlanPriceRow[] = [
  { key: "pro", stripe_price_id: "price_db_pro", stripe_price_yearly_id: "price_db_pro_y" },
  { key: "business", stripe_price_id: null, stripe_price_yearly_id: null },
  { key: "enterprise", stripe_price_id: "price_db_ent", stripe_price_yearly_id: null },
];

describe("resolvePriceId", () => {
  const env = {
    STRIPE_PRICE_PRO: "price_env_pro",
    STRIPE_PRICE_BUSINESS_MONTHLY: "price_env_biz_m",
    STRIPE_PRICE_BUSINESS_YEARLY: "price_env_biz_y",
  };

  it("zmienna środowiskowa ma pierwszeństwo, _MONTHLY przed gołą nazwą", () => {
    expect(resolvePriceId("pro", "monthly", env, plans)).toBe("price_env_pro");
    expect(resolvePriceId("business", "monthly", env, plans)).toBe("price_env_biz_m");
    expect(resolvePriceId("business", "yearly", env, plans)).toBe("price_env_biz_y");
  });

  it("fallback do kolumn plans", () => {
    expect(resolvePriceId("pro", "yearly", env, plans)).toBe("price_db_pro_y");
    expect(resolvePriceId("pro", "monthly", {}, plans)).toBe("price_db_pro");
  });

  it("brak ceny → null", () => {
    expect(resolvePriceId("business", "monthly", {}, plans)).toBeNull();
  });
});

describe("planKeyForPrice", () => {
  const env = { STRIPE_PRICE_PRO: "price_env_pro", STRIPE_PRICE_BUSINESS_YEARLY: "price_env_biz_y" };

  it("mapuje ceny z env i z bazy", () => {
    expect(planKeyForPrice("price_env_pro", env, plans)).toBe("pro");
    expect(planKeyForPrice("price_env_biz_y", env, plans)).toBe("business");
    expect(planKeyForPrice("price_db_pro_y", env, plans)).toBe("pro");
    expect(planKeyForPrice("price_db_ent", env, plans)).toBe("enterprise");
  });

  it("nieznana cena → null (plan nie jest zmieniany)", () => {
    expect(planKeyForPrice("price_unknown", env, plans)).toBeNull();
  });
});

describe("mapStripeStatus", () => {
  it("przepuszcza znane statusy i mapuje pozostałe", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("trialing")).toBe("trialing");
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
    expect(mapStripeStatus("paused")).toBe("unpaid");
    expect(mapStripeStatus("something_new")).toBe("incomplete");
  });
});

describe("shouldApplySubscription", () => {
  it("brak wiersza lub ta sama subskrypcja → zawsze zapis", () => {
    expect(shouldApplySubscription(null, { id: "sub_1", status: "active" })).toBe(true);
    expect(
      shouldApplySubscription(
        { stripe_subscription_id: "sub_1", status: "active" },
        { id: "sub_1", status: "canceled" },
      ),
    ).toBe(true);
  });

  it("spóźnione anulowanie starej subskrypcji nie nadpisuje nowej aktywnej", () => {
    expect(
      shouldApplySubscription(
        { stripe_subscription_id: "sub_new", status: "active" },
        { id: "sub_old", status: "canceled" },
      ),
    ).toBe(false);
  });

  it("nowa aktywna subskrypcja zastępuje anulowaną", () => {
    expect(
      shouldApplySubscription(
        { stripe_subscription_id: "sub_old", status: "canceled" },
        { id: "sub_new", status: "trialing" },
      ),
    ).toBe(true);
  });
});
