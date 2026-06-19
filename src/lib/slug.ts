export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DIACRITICS_PATTERN = /[̀-ͯ]/g;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS_PATTERN, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
