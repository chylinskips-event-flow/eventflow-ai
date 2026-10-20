/** Czerwona gwiazdka przy etykiecie pola wymaganego (czytniki ekranu słyszą „wymagane”). */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden className="text-destructive">
        *
      </span>
      <span className="sr-only">(wymagane)</span>
    </>
  );
}
