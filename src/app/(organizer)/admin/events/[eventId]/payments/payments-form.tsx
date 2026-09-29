"use client";

import { useActionState, useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  savePaymentConfig,
  testP24Connection,
  type PaymentConfigState,
  type TestConnectionState,
} from "./actions";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type MaskedConfig = {
  posId: string;
  merchantId: string;
  hasApiKey: boolean;
  hasCrc: boolean;
  sandbox: boolean;
  enabled: boolean;
} | null;

const initSave: PaymentConfigState = { status: "idle" };

export function PaymentsForm({
  eventId,
  existing,
}: {
  eventId: string;
  existing: MaskedConfig;
}) {
  const boundSave = savePaymentConfig.bind(null, eventId);
  const [saveState, saveAction, isSaving] = useActionState(boundSave, initSave);

  const [testState, setTestState] = useState<TestConnectionState>({ status: "idle" });
  const [isTesting, startTest] = useTransition();

  function handleTest() {
    startTest(async () => {
      const result = await testP24Connection(eventId);
      setTestState(result);
    });
  }

  return (
    <div className="space-y-8">
      {/* Config form */}
      <form action={saveAction} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p24-pos">Pos ID *</Label>
            <Input
              id="p24-pos"
              name="pos_id"
              required
              defaultValue={existing?.posId ?? ""}
              placeholder="np. 123456"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p24-merchant">Merchant ID *</Label>
            <Input
              id="p24-merchant"
              name="merchant_id"
              required
              defaultValue={existing?.merchantId ?? ""}
              placeholder="np. 123456"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p24-apikey">Klucz API</Label>
          <Input
            id="p24-apikey"
            name="api_key"
            type="password"
            autoComplete="new-password"
            placeholder={
              existing?.hasApiKey
                ? "Ustawiony ●●●●●● (zostaw puste, aby nie zmieniać)"
                : "Wpisz klucz API z panelu P24"
            }
          />
          <p className="text-xs text-muted-foreground">
            Szyfrowany — nigdy nie pojawia sie w odpowiedzi serwera.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p24-crc">Klucz CRC</Label>
          <Input
            id="p24-crc"
            name="crc"
            type="password"
            autoComplete="new-password"
            placeholder={
              existing?.hasCrc
                ? "Ustawiony ●●●●●● (zostaw puste, aby nie zmieniać)"
                : "Wpisz CRC z panelu P24"
            }
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">Tryb Sandbox</p>
            <p className="text-sm text-muted-foreground">
              Transakcje testowe — sandbox.przelewy24.pl (bez prawdziwych pieniedzy).
            </p>
          </div>
          <Switch
            id="p24-sandbox"
            name="sandbox"
            defaultChecked={existing?.sandbox ?? true}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">Wlacz platnosci</p>
            <p className="text-sm text-muted-foreground">
              Udostepnia platne bilety kupujacym.
            </p>
          </div>
          <Switch
            id="p24-enabled"
            name="enabled"
            defaultChecked={existing?.enabled ?? false}
          />
        </div>

        {saveState.message && (
          <div
            className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
              saveState.status === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-green-50 text-green-700"
            }`}
          >
            {saveState.status === "error" ? (
              <AlertCircle className="size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0" />
            )}
            {saveState.message}
          </div>
        )}

        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
          Zapisz konfiguracje
        </Button>
      </form>

      {/* Test connection — only if config exists */}
      {existing && (
        <div className="rounded-lg border p-5">
          <h3 className="mb-1 font-semibold">Testuj polaczenie</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Sprawdza czy zapisane dane sa poprawne (GET /api/v1/testAccess).
          </p>

          <Button
            type="button"
            variant="outline"
            disabled={isTesting}
            onClick={handleTest}
          >
            {isTesting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Testuj polaczenie P24
          </Button>

          {testState.message && (
            <div
              className={`mt-3 flex items-center gap-2 rounded-lg p-3 text-sm ${
                testState.status === "error"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-green-50 text-green-700"
              }`}
            >
              {testState.status === "error" ? (
                <AlertCircle className="size-4 shrink-0" />
              ) : (
                <CheckCircle2 className="size-4 shrink-0" />
              )}
              {testState.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
