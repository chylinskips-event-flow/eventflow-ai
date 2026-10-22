"use server";

import { headers } from "next/headers";
import { requestAccessLinkForEmail } from "@/lib/access-link";
import type { AccessLinkState } from "@/lib/access-link-core";

export async function requestAccessLink(
  slug: string,
  _prev: AccessLinkState,
  formData: FormData,
): Promise<AccessLinkState> {
  return requestAccessLinkForEmail({ slug, email: formData.get("email"), headers: await headers() });
}
