// Opcje typu wydarzenia (badge w hero + Select w ustawieniach eventu).
// Czysty moduł bez importów server-only — bezpieczny w komponentach klienckich.
// Bez CHECK w bazie — lista może ewoluować.

export const NO_EVENT_TYPE_VALUE = "__none__";

export const EVENT_TYPE_OPTIONS = [
  "Konferencja",
  "Targi",
  "Warsztaty",
  "Szkolenie",
  "Meetup",
  "Webinar",
  "Inne",
];
