import { colord, extend } from "colord";
import a11yPlugin from "colord/plugins/a11y";

extend([a11yPlugin]);

export type EventColorVars = {
  "--primary": string;
  "--primary-foreground": string;
  "--accent": string;
  "--accent-foreground": string;
  "--border": string;
  "--ring": string;
};

function pickReadableText(bgColor: string) {
  const white = "#ffffff";
  const black = "#0a0a0a";
  return colord(bgColor).contrast(white) >= colord(bgColor).contrast(black)
    ? white
    : black;
}

/**
 * Jaśniejszy wariant bazowego koloru, do tła/hover. Cel jasności jest
 * adaptacyjny (capped), nie addytywny — addytywne lighten() clamps do
 * #ffffff dla już jasnych kolorów wejściowych, czyniąc accent identycznym
 * z białym tłem strony. Pętla dociąga w dół, jeśli wynik i tak jest
 * praktycznie niewidoczny na tle (sanity floor, nie wymóg WCAG tekstu —
 * accent to panel, nie tekst).
 */
function deriveAccent(baseHex: string, background = "#ffffff") {
  const { h, s, l } = colord(baseHex).toHsl();
  let targetL = Math.min(l + 25, 94);
  let candidate = colord({ h, s, l: targetL }).toHex();
  let attempts = 0;

  while (
    colord(candidate).contrast(background) < 1.5 &&
    attempts < 10 &&
    targetL > 50
  ) {
    targetL -= 5;
    candidate = colord({ h, s, l: targetL }).toHex();
    attempts++;
  }

  return candidate;
}

/**
 * Ciemniejszy wariant — do tekstu/obramowań NA accent (nie na base!).
 * Liczony względem accent, bo to jest tło, na którym faktycznie ma być
 * czytelny. Iteruje, aż rzeczywisty kontrast (colord.contrast(), WCAG)
 * osiągnie 4.5:1 — z twardym fallbackiem biały/czarny, jeśli nawet pełne
 * dociemnienie nie wystarczy.
 */
function deriveAccentForeground(accentHex: string) {
  const { h, s, l } = colord(accentHex).toHsl();
  let candidateL = Math.max(l - 35, 5);
  let candidate = colord({ h, s, l: candidateL }).toHex();
  let attempts = 0;

  while (colord(candidate).contrast(accentHex) < 4.5 && attempts < 8) {
    candidateL = Math.max(candidateL - 8, 0);
    candidate = colord({ h, s, l: candidateL }).toHex();
    attempts++;
  }

  return colord(candidate).contrast(accentHex) >= 4.5
    ? candidate
    : pickReadableText(accentHex);
}

export function getEventColorVars(primaryColorHex: string): EventColorVars {
  const base = colord(primaryColorHex).toHex();
  const accent = deriveAccent(base);
  const accentForeground = deriveAccentForeground(accent);

  return {
    "--primary": base,
    "--primary-foreground": pickReadableText(base),
    "--accent": accent,
    "--accent-foreground": accentForeground,
    "--border": accentForeground,
    "--ring": base,
  };
}
