import Link from "next/link";
import type { CtaContent } from "@/lib/event-sections";
import { Button } from "@/components/ui/button";

export function SectionCta({ content }: { content: CtaContent }) {
  if (!content.heading || !content.button_label || !content.button_href) return null;

  const isExternal =
    content.button_href.startsWith("http://") ||
    content.button_href.startsWith("https://");

  return (
    <section className="bg-primary/10 border-y">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 px-4 py-10 text-center">
        <h2 className="text-2xl font-bold">{content.heading}</h2>
        {content.subtext && (
          <p className="text-muted-foreground">{content.subtext}</p>
        )}
        {isExternal ? (
          <Button asChild size="lg">
            <a
              href={content.button_href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {content.button_label}
            </a>
          </Button>
        ) : (
          <Button asChild size="lg">
            <Link href={content.button_href}>{content.button_label}</Link>
          </Button>
        )}
      </div>
    </section>
  );
}
