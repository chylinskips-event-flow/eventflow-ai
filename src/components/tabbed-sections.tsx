"use client";

import { useEffect, useRef, useState } from "react";
import { TabBar, panelDomId, tabDomId, type TabBarItem } from "@/components/tab-bar";
import { tabFromHash, urlForTab } from "@/lib/url-tabs";

/**
 * Ekran podzielony na zakładki (panel organizatora): pasek TabBar + panele.
 *
 * - Aktywna zakładka w adresie (`?tab=`, domyślna bez parametru) — odświeżenie i linki
 *   otwierają właściwą zakładkę; stare kotwice (`#branding`, `#stoisko` z maili) też.
 * - WSZYSTKIE panele są zamontowane, nieaktywne tylko ukryte (`hidden`): formularze nie tracą
 *   wpisanych danych przy zmianie zakładki, a pola powiązane atrybutem `form` z formularzem
 *   z innej zakładki (np. kolor w „Branding” → formularz „Ogólne”) dalej się wysyłają.
 *   Dlatego zmiana zakładki nie pyta o potwierdzenie; ostrzegamy tylko przy zamknięciu
 *   lub przeładowaniu karty z niezapisanymi zmianami.
 */
export function TabbedSections<K extends string>({
  tabs,
  panels,
  initialTab,
  defaultTab,
  idPrefix,
  ariaLabel,
  hashAliases,
}: {
  tabs: TabBarItem<K>[];
  panels: Partial<Record<K, React.ReactNode>>;
  /** Zakładka z `?tab=` rozstrzygnięta na serwerze (resolveTabKey). */
  initialTab: K;
  defaultTab: K;
  idPrefix: string;
  ariaLabel: string;
  /** Dodatkowe kotwice prowadzące do zakładek (np. stare id sekcji). */
  hashAliases?: Partial<Record<string, K>>;
}) {
  const [active, setActive] = useState<K>(initialTab);
  const dirty = useRef(false);
  const keys = tabs.map((t) => t.key);

  function select(key: K) {
    if (!keys.includes(key)) return;
    setActive(key);
    window.history.replaceState(window.history.state, "", urlForTab(window.location.href, key, defaultTab));
  }

  // Stary link z kotwicą → zakładka (raz, po załadowaniu). Kotwica nie jest dostępna na serwerze.
  useEffect(() => {
    const fromHash = tabFromHash(window.location.hash, keys, hashAliases);
    if (!fromHash) return;
    // Po pierwszym renderze (kotwica znana dopiero w przeglądarce) — w kolejnej klatce.
    const frame = window.requestAnimationFrame(() => select(fromHash));
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tylko przy wejściu na stronę
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return (
    <div
      className="flex min-w-0 flex-col gap-6"
      onInput={() => (dirty.current = true)}
      onChange={() => (dirty.current = true)}
      onSubmit={() => (dirty.current = false)}
    >
      <TabBar tabs={tabs} active={active} onSelect={select} idPrefix={idPrefix} ariaLabel={ariaLabel} />
      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          id={panelDomId(idPrefix, t.key)}
          aria-labelledby={tabDomId(idPrefix, t.key)}
          hidden={t.key !== active}
          tabIndex={0}
          className="flex min-w-0 flex-col gap-6 focus-visible:outline-none"
        >
          {panels[t.key]}
        </div>
      ))}
    </div>
  );
}
