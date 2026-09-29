"use client";

import { useState, useTransition, useOptimistic } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Pencil,
  Trash2,
  Plus,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { EventSection, SectionType } from "@/lib/event-sections";
import {
  SECTION_TYPE_LABELS,
  ALL_SECTION_TYPES,
} from "@/lib/event-sections";
import {
  createEventSection,
  toggleEventSection,
  deleteEventSection,
  reorderEventSections,
} from "./event-sections-actions";
import { EventSectionForm } from "./event-section-form";

interface Props {
  eventId: string;
  initialSections: EventSection[];
}

export function EventSectionsBuilder({ eventId, initialSections }: Props) {
  const [sections, setOptimisticSections] = useOptimistic(initialSections);
  const [editingSection, setEditingSection] = useState<EventSection | null>(null);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(sections, oldIndex, newIndex);

    startTransition(async () => {
      setOptimisticSections(reordered);
      await reorderEventSections(eventId, reordered.map((s) => s.id));
    });
  }

  function handleToggle(sectionId: string, enabled: boolean) {
    startTransition(async () => {
      setOptimisticSections(
        sections.map((s) => s.id === sectionId ? { ...s, enabled } : s),
      );
      await toggleEventSection(eventId, sectionId, enabled);
    });
  }

  function handleDelete(sectionId: string) {
    startTransition(async () => {
      setOptimisticSections(sections.filter((s) => s.id !== sectionId));
      await deleteEventSection(eventId, sectionId);
    });
  }

  function handleAdd(type: SectionType) {
    setShowTypeMenu(false);
    startTransition(async () => {
      await createEventSection(eventId, type);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-muted-foreground text-sm">
            Brak dodanych sekcji. Kliknij „Dodaj sekcję", aby dodać pierwszą.
          </p>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {sections.map((section) => (
                <SortableSectionRow
                  key={section.id}
                  section={section}
                  onEdit={() => setEditingSection(section)}
                  onToggle={(enabled) => handleToggle(section.id, enabled)}
                  onDelete={() => handleDelete(section.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="relative">
        <Button
          variant="outline"
          onClick={() => setShowTypeMenu((v) => !v)}
          className="flex items-center gap-1"
        >
          <Plus className="size-4" />
          Dodaj sekcję
          <ChevronDown className="size-4 ml-1" />
        </Button>
        {showTypeMenu && (
          <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border bg-popover shadow-md overflow-hidden">
            {ALL_SECTION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleAdd(type)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {SECTION_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        )}
      </div>

      {editingSection && (
        <EventSectionForm
          eventId={eventId}
          section={editingSection}
          open={!!editingSection}
          onClose={() => setEditingSection(null)}
        />
      )}
    </div>
  );
}

// ---- Sortable row -------------------------------------------------------

interface RowProps {
  section: EventSection;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}

function SortableSectionRow({ section, onEdit, onToggle, onDelete }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing touch-none"
        aria-label="Przeciągnij aby zmienić kolejność"
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs shrink-0">
            {SECTION_TYPE_LABELS[section.type]}
          </Badge>
          <SectionPreview section={section} />
        </div>
      </div>

      <label className="flex items-center gap-1.5 cursor-pointer shrink-0" title={section.enabled ? "Wyłącz sekcję" : "Włącz sekcję"}>
        <input
          type="checkbox"
          className="sr-only"
          checked={section.enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <div
          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
            section.enabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <div
            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
              section.enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </div>
      </label>

      <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label="Edytuj sekcję">
        <Pencil className="size-4" />
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label="Usuń sekcję">
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć sekcję?</AlertDialogTitle>
            <AlertDialogDescription>
              Ta operacja jest nieodwracalna. Sekcja zostanie trwale usunięta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SectionPreview({ section }: { section: EventSection }) {
  const c = section.content as Record<string, unknown>;
  let preview = "";
  if (c.heading && typeof c.heading === "string") preview = c.heading;
  else if (c.address && typeof c.address === "string") preview = c.address as string;
  else if (c.body && typeof c.body === "string") preview = (c.body as string).slice(0, 60);
  else if (Array.isArray(c.items) && c.items.length > 0) preview = `${c.items.length} element(ów)`;
  else if (Array.isArray(c.images) && c.images.length > 0) preview = `${c.images.length} zdjęć`;

  if (!preview) return <span className="text-xs text-muted-foreground italic truncate">(pusta)</span>;
  return <span className="text-xs text-muted-foreground truncate">{preview}</span>;
}
