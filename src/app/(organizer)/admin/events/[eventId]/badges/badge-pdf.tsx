import fs from "fs";
import path from "path";
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Font,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Attendee } from "@/lib/attendees";
import type { Event } from "@/lib/events";

function fontSrc(filename: string): string {
  // Read locally so Vercel never fetches from an external CDN at render time.
  const buf = fs.readFileSync(path.join(process.cwd(), "public/fonts", filename));
  return `data:font/woff;base64,${buf.toString("base64")}`;
}

// Full (non-subset) Roboto WOFF1 — covers Polish characters, loaded from disk.
Font.register({
  family: "Roboto",
  fonts: [
    { src: fontSrc("Roboto-Regular.woff"), fontWeight: 400 },
    { src: fontSrc("Roboto-Bold.woff"), fontWeight: 700 },
  ],
});

// Deterministic avatar background color from attendee id.
const AVATAR_COLORS = [
  "#4f46e5", "#0891b2", "#059669", "#d97706",
  "#dc2626", "#7c3aed", "#be185d", "#0d9488",
];

function avatarBg(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(a: Attendee): string {
  const f = a.first_name?.[0] ?? "";
  const l = a.last_name?.[0] ?? "";
  return (f + l).toUpperCase() || "?";
}

const S = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    backgroundColor: "#ffffff",
    flexDirection: "column",
  },

  // Full-bleed background image (absolutely positioned behind content)
  bgImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  // Outer content wrapper — fills the page over the bg
  content: {
    flex: 1,
    flexDirection: "column",
  },

  // ── Header ──────────────────────────────────────────────
  // Solid accent-colored header (no bg image)
  header: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  // Dark scrim header (with bg image)
  headerOverlay: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  logo: {
    width: 38,
    height: 38,
    objectFit: "contain",
  },
  headerText: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
  },
  eventName: {
    fontSize: 11,
    fontWeight: 700,
    color: "#ffffff",
    letterSpacing: 0.2,
  },

  // ── Body ────────────────────────────────────────────────
  body: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },

  // ── Avatar ──────────────────────────────────────────────
  avatarImg: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarImgBorder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  avatarInitials: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialsBorder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  initialsText: {
    fontSize: 30,
    fontWeight: 700,
    color: "#ffffff",
  },

  // ── Name/info card ──────────────────────────────────────
  // On white page: no card background needed
  nameCardDefault: {
    alignItems: "center",
    paddingHorizontal: 4,
  },
  // On bg image: white scrim for legibility
  nameCardScrim: {
    backgroundColor: "rgba(255,255,255,0.88)",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
    alignSelf: "stretch",
  },
  name: {
    fontSize: 19,
    fontWeight: 700,
    color: "#111111",
    textAlign: "center",
    marginBottom: 3,
  },
  info: {
    fontSize: 10,
    color: "#555555",
    textAlign: "center",
  },

  // ── QR card — ALWAYS solid white (hard requirement for scanability) ──
  qrCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  qrImg: {
    width: 84,
    height: 84,
  },
  qrCaption: {
    fontSize: 7.5,
    color: "#888888",
    marginTop: 4,
    textAlign: "center",
  },

  // ── Bottom accent strip (no-bg layout only) ──────────────
  accentStrip: {
    height: 8,
  },
});

export type BadgesPdfProps = {
  event: Event;
  attendees: Attendee[];
  /** Overrides event.name on the badge header. */
  customTitle?: string;
  /** Map of attendeeId → QR data URL (PNG base64). */
  qrDataUrls: Record<string, string>;
};

export function BadgesPdf({
  event,
  attendees,
  customTitle,
  qrDataUrls,
}: BadgesPdfProps) {
  const accent = event.primary_color ?? "#1a1a2e";
  const title = customTitle ?? event.name;
  const hasBg = Boolean(event.badge_bg_url);

  return (
    <Document>
      {attendees.map((a) => {
        const info = [a.company, a.job_title].filter(Boolean).join(" · ");
        const fullName =
          [a.first_name, a.last_name].filter(Boolean).join(" ") || "—";
        const bg = avatarBg(a.id);

        return (
          <Page key={a.id} size="A6" style={S.page}>
            {/* Layer 1: full-bleed background image */}
            {hasBg && event.badge_bg_url && (
              <Image src={event.badge_bg_url} style={S.bgImage} />
            )}

            {/* Layer 2: content (sits on top of bg due to normal flow order) */}
            <View style={S.content}>
              {/* Header */}
              <View
                style={
                  hasBg
                    ? S.headerOverlay
                    : [S.header, { backgroundColor: accent }]
                }
              >
                {event.logo_url ? (
                  <Image src={event.logo_url} style={S.logo} />
                ) : null}
                <View style={S.headerText}>
                  <Text style={S.eventName}>{title}</Text>
                </View>
              </View>

              {/* Body */}
              <View style={S.body}>
                {/* Avatar */}
                {a.avatar_url ? (
                  <Image
                    src={a.avatar_url}
                    style={hasBg ? S.avatarImgBorder : S.avatarImg}
                  />
                ) : (
                  <View
                    style={[
                      hasBg ? S.avatarInitialsBorder : S.avatarInitials,
                      { backgroundColor: bg },
                    ]}
                  >
                    <Text style={S.initialsText}>{initials(a)}</Text>
                  </View>
                )}

                {/* Name + info */}
                <View style={hasBg ? S.nameCardScrim : S.nameCardDefault}>
                  <Text style={S.name}>{fullName}</Text>
                  {info ? <Text style={S.info}>{info}</Text> : null}
                </View>

                {/* QR — always on white card */}
                {qrDataUrls[a.id] ? (
                  <View style={S.qrCard}>
                    <Image src={qrDataUrls[a.id]} style={S.qrImg} />
                    <Text style={S.qrCaption}>
                      Zeskanuj, by wymienić kontakt
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Bottom accent strip — only when no background image */}
              {!hasBg && (
                <View style={[S.accentStrip, { backgroundColor: accent }]} />
              )}
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
