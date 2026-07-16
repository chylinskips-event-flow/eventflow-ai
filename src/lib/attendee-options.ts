// Współdzielone stałe formularzy uczestnika (rejestracja + edycja profilu).
// Czysty moduł bez importów server-only — bezpieczny w komponentach klienckich.

// Wartość "nie wybrano" dla selecta celu (Radix Select nie akceptuje "").
export const NO_GOAL_VALUE = "__none__";

export const GOAL_OPTIONS = [
  { value: "networking", label: "Networking" },
  { value: "wiedza-branzowa", label: "Wiedza branżowa" },
  { value: "poszukiwanie-dostawcow", label: "Poszukiwanie dostawców" },
  { value: "inne", label: "Inne" },
];
