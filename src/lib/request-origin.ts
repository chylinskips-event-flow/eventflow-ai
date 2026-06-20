export function getOrigin(headersList: Headers) {
  // Origin header is present on the POST request a Server Action makes.
  // Fallback to forwarded headers in case a proxy strips Origin.
  const origin = headersList.get("origin");
  if (origin) return origin;

  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}
