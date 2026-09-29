import type { FaqContent } from "@/lib/event-sections";
import { renderMarkdown } from "@/lib/markdown";

export async function SectionFaq({ content }: { content: FaqContent }) {
  if (!content.items?.length) return null;

  const renderedItems = await Promise.all(
    content.items.map(async (item) => ({
      q: item.q,
      aHtml: await renderMarkdown(item.a),
    })),
  );

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10">
      {content.heading && (
        <h2 className="mb-6 text-xl font-semibold">{content.heading}</h2>
      )}
      <div className="flex flex-col divide-y rounded-xl border overflow-hidden">
        {renderedItems.map((item, i) => (
          <details key={i} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-medium hover:bg-muted/50 transition-colors [&::-webkit-details-marker]:hidden">
              <span>{item.q}</span>
              <svg
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div
              className="px-5 pb-4 pt-1 text-muted-foreground prose prose-sm prose-neutral dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: item.aHtml }}
            />
          </details>
        ))}
      </div>
    </section>
  );
}
