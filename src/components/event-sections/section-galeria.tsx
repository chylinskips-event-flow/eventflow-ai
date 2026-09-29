import type { GaleriaContent } from "@/lib/event-sections";

interface Props {
  content: GaleriaContent;
  supabaseUrl: string;
}

export function SectionGaleria({ content, supabaseUrl }: Props) {
  if (!content.images?.length) return null;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10">
      {content.heading && (
        <h2 className="mb-4 text-xl font-semibold">{content.heading}</h2>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {content.images.map((img, i) => {
          const url = `${supabaseUrl}/storage/v1/object/public/event-sections/${img.storage_path}`;
          return (
            <div key={i} className="aspect-square overflow-hidden rounded-lg bg-muted">
              <img
                src={url}
                alt={img.alt || ""}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
