import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getMixer, getMixerPlan } from "@/lib/mixer/getters";
import type { MixerRow, PlanRound } from "@/lib/mixer/getters";

type Params = { params: Promise<{ eventId: string; mixerId: string }> };

// ── Arkusz 1: Wg rundy ─────────────────────────────────────────────────────

function buildSheetWgRundy(
  workbook: ExcelJS.Workbook,
  mixer: MixerRow,
  plan: PlanRound[],
) {
  const ws = workbook.addWorksheet("Wg rundy");

  ws.columns = [
    { key: "round",    header: "Runda",               width: 8  },
    { key: "table",    header: "Stół",                width: 8  },
    { key: "break",    header: "Przerwa",              width: 12 },
    { key: "question", header: "Pytanie (ice-breaker)", width: 40 },
    { key: "name",     header: "Uczestnik",            width: 28 },
    { key: "company",  header: "Firma",                width: 28 },
  ];

  for (const round of plan) {
    let firstRowInRound = true;
    for (const table of [...round.tables].sort((a, b) => a.tableNumber - b.tableNumber)) {
      const sortedParticipants = [...table.participants].sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      );
      for (const participant of sortedParticipants) {
        const isBreakRound = round.roundNumber === mixer.break_after_round;
        ws.addRow({
          round:    round.roundNumber,
          table:    table.tableNumber,
          break:    firstRowInRound && isBreakRound ? "☕ po tej rundzie" : "",
          question: table.question ?? "",
          name:     participant.display_name,
          company:  participant.company ?? "",
        });
        firstRowInRound = false;
      }
    }
  }

  // Styl nagłówka
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE3F2FD" },
  } as ExcelJS.Fill;

  // Zamroź wiersz 1
  ws.views = [{ state: "frozen", ySplit: 1 } as ExcelJS.WorksheetView];
}

// ── Arkusz 2: Wg stołu (macierz) ──────────────────────────────────────────

function buildSheetWgStolu(
  workbook: ExcelJS.Workbook,
  mixer: MixerRow,
  plan: PlanRound[],
) {
  const ws = workbook.addWorksheet("Wg stołu");

  // Zbierz unikalne numery stolów i rund
  const tableNumbers = Array.from(
    new Set(plan.flatMap((r) => r.tables.map((t) => t.tableNumber))),
  ).sort((a, b) => a - b);

  const roundNumbers = plan.map((r) => r.roundNumber).sort((a, b) => a - b);

  // Zbuduj mapę table → round → {names, question}
  const dataMap = new Map<number, Map<number, { names: string[]; question: string | null }>>();
  for (const round of plan) {
    for (const table of round.tables) {
      if (!dataMap.has(table.tableNumber)) dataMap.set(table.tableNumber, new Map());
      const names = [...table.participants]
        .sort((a, b) => a.display_name.localeCompare(b.display_name))
        .map((p) => p.display_name);
      dataMap.get(table.tableNumber)!.set(round.roundNumber, {
        names,
        question: table.question ?? null,
      });
    }
  }

  // Wiersz nagłówka
  const headerValues: (string | number)[] = ["Stół"];
  for (const rn of roundNumbers) {
    headerValues.push(rn === mixer.break_after_round ? `R${rn} ☕` : `R${rn}`);
  }
  const headerRow = ws.addRow(headerValues);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE3F2FD" },
  } as ExcelJS.Fill;

  // Wiersze danych
  for (const tableNum of tableNumbers) {
    const rowValues: (string | number)[] = [`Stół ${tableNum}`];
    const roundData = dataMap.get(tableNum) ?? new Map();
    for (const rn of roundNumbers) {
      const entry = roundData.get(rn);
      rowValues.push(entry ? entry.names.join("\n") : "");
    }
    const row = ws.addRow(rowValues);

    // wrapText + vertical top dla komórek z uczestnikami (kolumny 2+)
    let maxNames = 1;
    for (let col = 2; col <= roundNumbers.length + 1; col++) {
      const cell = row.getCell(col);
      cell.alignment = { wrapText: true, vertical: "top" };
      const names = roundData.get(roundNumbers[col - 2]);
      if (names && names.names.length > maxNames) maxNames = names.names.length;
    }
    row.height = Math.max(18, maxNames * 16);
  }

  // Szerokości kolumn
  ws.getColumn(1).width = 12;
  for (let i = 2; i <= roundNumbers.length + 1; i++) {
    ws.getColumn(i).width = 28;
  }

  // Zamroź wiersz 1
  ws.views = [{ state: "frozen", ySplit: 1 } as ExcelJS.WorksheetView];
}

// ── Arkusz 3: Ścieżki uczestników ────────────────────────────────────────

function buildSciezki(
  workbook: ExcelJS.Workbook,
  mixer: MixerRow,
  plan: PlanRound[],
) {
  const ws = workbook.addWorksheet("Ścieżki uczestników");

  // Zbierz unikalnych uczestników
  const participantsMap = new Map<string, { id: string; display_name: string; company: string | null }>();
  for (const round of plan) {
    for (const table of round.tables) {
      for (const p of table.participants) {
        if (!participantsMap.has(p.id)) {
          participantsMap.set(p.id, { id: p.id, display_name: p.display_name, company: p.company ?? null });
        }
      }
    }
  }

  // Zbuduj mapę participantId → roundNumber → tableNumber
  const pathMap = new Map<string, Map<number, number>>();
  for (const round of plan) {
    for (const table of round.tables) {
      for (const p of table.participants) {
        if (!pathMap.has(p.id)) pathMap.set(p.id, new Map());
        pathMap.get(p.id)!.set(round.roundNumber, table.tableNumber);
      }
    }
  }

  const roundNumbers = plan.map((r) => r.roundNumber).sort((a, b) => a - b);

  // Nagłówki kolumn
  const headerValues: string[] = ["Uczestnik", "Firma"];
  for (const rn of roundNumbers) {
    headerValues.push(rn === mixer.break_after_round ? `R${rn} ☕` : `R${rn}`);
  }
  const headerRow = ws.addRow(headerValues);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE3F2FD" },
  } as ExcelJS.Fill;

  // Ustaw szerokości
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 24;
  for (let i = 3; i <= roundNumbers.length + 2; i++) {
    ws.getColumn(i).width = 8;
  }

  // Wiersze posortowane alfabetycznie
  const sorted = Array.from(participantsMap.values()).sort((a, b) =>
    a.display_name.localeCompare(b.display_name),
  );

  for (const participant of sorted) {
    const rowValues: (string | number)[] = [participant.display_name, participant.company ?? ""];
    const pPath = pathMap.get(participant.id) ?? new Map();
    for (const rn of roundNumbers) {
      const tableNum = pPath.get(rn);
      rowValues.push(tableNum ?? "");
    }
    ws.addRow(rowValues);
  }

  // Zamroź kolumny A i B oraz wiersz 1
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 } as ExcelJS.WorksheetView];
}

// ── Arkusz 4: Raport jakości ─────────────────────────────────────────────

function buildRaport(workbook: ExcelJS.Workbook, mixer: MixerRow) {
  const ws = workbook.addWorksheet("Raport jakości");

  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 24;

  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE3F2FD" },
  };
  const labelFont: Partial<ExcelJS.Font> = { color: { argb: "FF555555" } };

  // Sekcja 1: Parametry mixera
  const h1 = ws.addRow(["Parametry mixera", ""]);
  h1.font = { bold: true };
  h1.fill = headerFill;

  const params: [string, string | number][] = [
    ["Nazwa",               mixer.name],
    ["Status",              mixer.status],
    ["Liczba stolików",     mixer.table_count],
    ["Miejsca min",         mixer.seat_min],
    ["Miejsca max",         mixer.seat_max],
    ["Liczba rund",         mixer.rounds_count],
    ["Czas rundy (min)",    mixer.round_minutes],
    ["Czas przerwy (min)",  mixer.break_minutes],
    ["Przerwa po rundzie",  mixer.break_after_round ?? "brak"],
  ];

  for (const [label, value] of params) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = labelFont;
  }

  // Separator
  ws.addRow([]);

  // Sekcja 2: Metryki jakości
  const h2 = ws.addRow(["Metryki jakości", ""]);
  h2.font = { bold: true };
  h2.fill = headerFill;

  if (mixer.quality) {
    const q = mixer.quality;
    const metrics: [string, string | number][] = [
      ["Unikalne spotkania — min",    q.uniqueMeetingsMin],
      ["Unikalne spotkania — mediana", q.uniqueMeetingsMed],
      ["Unikalne spotkania — max",    q.uniqueMeetingsMax],
      ["Powtórzone pary",             q.repeatedPairs],
      ["Incydenty klastrów",          q.clusterIncidents],
      ["Wykonalny",                   q.feasible ? "Tak" : "Nie"],
    ];
    for (const [label, value] of metrics) {
      const row = ws.addRow([label, value]);
      row.getCell(1).font = labelFont;
    }
  } else {
    ws.addRow(["Brak danych — wygeneruj plan", ""]);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const { eventId, mixerId } = await params;

  const [mixer, plan] = await Promise.all([
    getMixer(mixerId, eventId),
    getMixerPlan(mixerId, eventId),
  ]);

  if (!mixer) return new Response("Not found", { status: 404 });
  if (plan.length === 0) return new Response("Plan not generated", { status: 400 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Eventro";
  workbook.created = new Date();

  buildSheetWgRundy(workbook, mixer, plan);
  buildSheetWgStolu(workbook, mixer, plan);
  buildSciezki(workbook, mixer, plan);
  buildRaport(workbook, mixer);

  const buffer = await workbook.xlsx.writeBuffer();

  const safeName =
    mixer.name
      .replace(/[^\w\s\-]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase() || "mixer";
  const filename = `mixer-${safeName}-plan.xlsx`;

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
