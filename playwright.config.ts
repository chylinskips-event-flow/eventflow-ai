import { defineConfig } from "@playwright/test";
import { APP_PORT, APP_URL, FAKE_RESEND_URL, MAIL_PORT, localSupabase } from "./e2e/env";

// Testy end-to-end na lokalnym Supabase (Docker) i lokalnym serwerze Next.
// Uruchomienie: npm run e2e (reset lokalnej bazy + testy). Wymaga: npx supabase start.
const sb = localSupabase();

export default defineConfig({
  testDir: "e2e/tests",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e/report", open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: APP_URL,
    channel: "chrome",
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `node e2e/fake-resend.mjs ${MAIL_PORT}`,
      url: `${FAKE_RESEND_URL}/__health`,
      reuseExistingServer: false,
    },
    {
      command: `npx next dev --port ${APP_PORT} --hostname localhost`,
      url: `${APP_URL}/login`,
      timeout: 240_000,
      reuseExistingServer: false,
      // Każda zmienna z .env.local jest tu nadpisana niepustą wartością lokalną
      // (Next nie nadpisuje zmiennych ustawionych w procesie, ale zastępuje puste).
      env: {
        NEXT_PUBLIC_SUPABASE_URL: sb.apiUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: sb.anonKey,
        SUPABASE_SERVICE_ROLE_KEY: sb.serviceRoleKey,
        RESEND_API_KEY: "re_e2e_fake",
        RESEND_FROM: "Eventro E2E <e2e@example.test>",
        RESEND_BASE_URL: FAKE_RESEND_URL,
        ANTHROPIC_API_KEY: "e2e-disabled",
        CRON_SECRET: "e2e-cron-secret",
        BILLING_ENABLED: "false",
        // Bez NEXT_PUBLIC_ROOT_DOMAIN linki w mailach budują się z adresu lokalnego serwera.
        ROOT_DOMAIN: "e2e.invalid",
        VERCEL_API_TOKEN: "",
        VERCEL_PROJECT_ID: "",
        PARTNER_LEADS_ENABLED: "true",
      },
    },
  ],
});
