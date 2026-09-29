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

// Roboto WOFF1 from Google Fonts — includes Latin Extended (Polish characters).
Font.register({
  family: "Roboto",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff",
      fontWeight: 400,
    },
    {
      src: "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4.woff",
      fontWeight: 700,
    },
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

const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    backgroundColor: "#ffffff",
    flexDirection: "column",
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
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
  eventSubtitle: {
    fontSize: 8,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  body: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 0,
  },
  avatarImg: {
    width: 82,
    height: 82,
    borderRadius: 41,
    marginBottom: 10,
  },
  avatarInitials: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  initialsText: {
    fontSize: 32,
    fontWeight: 700,
    color: "#ffffff",
  },
  name: {
    fontSize: 19,
    fontWeight: 700,
    color: "#111111",
    textAlign: "center",
    marginBottom: 5,
  },
  info: {
    fontSize: 10,
    color: "#555555",
    textAlign: "center",
    marginBottom: 2,
  },
  qrWrap: {
    alignItems: "center",
    marginTop: 12,
  },
  qrImg: {
    width: 86,
    height: 86,
  },
  qrCaption: {
    fontSize: 7.5,
    color: "#888888",
    marginTop: 4,
    textAlign: "center",
  },
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

  return (
    <Document>
      {attendees.map((a) => {
        const info = [a.company, a.job_title].filter(Boolean).join(" · ");
        const fullName =
          [a.first_name, a.last_name].filter(Boolean).join(" ") || "—";

        return (
          <Page key={a.id} size="A6" style={styles.page}>
            {/* Branded header */}
            <View style={[styles.header, { backgroundColor: accent }]}>
              {event.logo_url ? (
                <Image src={event.logo_url} style={styles.logo} />
              ) : null}
              <View style={styles.headerText}>
                <Text style={styles.eventName}>{title}</Text>
              </View>
            </View>

            {/* Main body */}
            <View style={styles.body}>
              {a.avatar_url ? (
                <Image src={a.avatar_url} style={styles.avatarImg} />
              ) : (
                <View
                  style={[styles.avatarInitials, { backgroundColor: avatarBg(a.id) }]}
                >
                  <Text style={styles.initialsText}>{initials(a)}</Text>
                </View>
              )}

              <Text style={styles.name}>{fullName}</Text>
              {info ? <Text style={styles.info}>{info}</Text> : null}

              {qrDataUrls[a.id] ? (
                <View style={styles.qrWrap}>
                  <Image src={qrDataUrls[a.id]} style={styles.qrImg} />
                  <Text style={styles.qrCaption}>
                    Zeskanuj, by wymienić kontakt
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Bottom accent strip */}
            <View style={[styles.accentStrip, { backgroundColor: accent }]} />
          </Page>
        );
      })}
    </Document>
  );
}
