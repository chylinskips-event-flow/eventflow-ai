import type { OpisContent } from "@/lib/event-sections";
import { renderMarkdown } from "@/lib/markdown";

export async function SectionOpis({ content }: { content: OpisContent }) {
  const html = await renderMarkdown(content.body ?? "");
  if (!html) return null;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10">
      {content.heading && (
        <h2 className="mb-4 text-xl font-semibold">{content.heading}</h2>
      )}
      <div
        className="prose prose-neutral dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
