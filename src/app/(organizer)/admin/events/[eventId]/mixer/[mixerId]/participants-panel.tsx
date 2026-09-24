"use client";

import { useState, useTransition } from "react";
import { UserCheck, UserX, Clock, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  addParticipants,
  setParticipantStatus,
} from "../actions";
import type { MixerParticipant } from "@/lib/mixer/getters";

type AttendeeOption = { id: string; name: string; company: string | null };

type Props = {
  eventId: string;
  mixerId: string;
  participants: MixerParticipant[];
  allAttendees: AttendeeOption[];
  existingAttendeeIds: string[];
  isLive?: boolean;
};

const STATUS_CONFIG = {
  active:  { label: "Aktywny",    variant: "success"  as const, icon: UserCheck },
  absent:  { label: "Nieobecny",  variant: "warning"  as const, icon: Clock },
  dropped: { label: "Usunięty",   variant: "outline"  as const, icon: UserX },
};

export function ParticipantsPanel({
  eventId,
  mixerId,
  participants,
  allAttendees,
  existingAttendeeIds,
  isLive = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, start] = useTransition();
  const [statusPending, setStatusPending] = useState<string | null>(null);

  const activeCount = participants.filter((p) => p.status === "active").length;

  const available = allAttendees.filter(
    (a) => !existingAttendeeIds.includes(a.id),
  );
  const filteredAvailable = available.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.company ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const filtered = participants.filter(
    (p) =>
      p.display_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.company ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAdd() {
    if (selectedIds.size === 0) return;
    start(async () => {
      await addParticipants(mixerId, eventId, [...selectedIds]);
      setSelectedIds(new Set());
      setIsOpen(false);
    });
  }

  function handleStatus(
    participantId: string,
    status: "active" | "absent" | "dropped",
  ) {
    setStatusPending(participantId);
    start(async () => {
      await setParticipantStatus(participantId, mixerId, eventId, status);
      setStatusPending(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{activeCount}</span> aktywnych
          {" / "}
          <span className="font-medium text-foreground">{participants.length}</span> łącznie
        </p>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={isLive}>
              <Plus className="size-4" />
              Dodaj z listy
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Dodaj uczestników</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Szukaj..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                {filteredAvailable.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    Brak uczestników do dodania.
                  </p>
                ) : (
                  filteredAvailable.map((a) => (
                    <label
                      key={a.id}
                      className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        className="size-4 rounded border-border"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        {a.company && (
                          <p className="truncate text-xs text-muted-foreground">{a.company}</p>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size > 0 ? `${selectedIds.size} zaznaczonych` : ""}
                </span>
                <Button
                  onClick={handleAdd}
                  disabled={selectedIds.size === 0 || isPending}
                  size="sm"
                >
                  {isPending ? "Dodawanie..." : `Dodaj${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Participant list search */}
      {participants.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Szukaj uczestnika..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {participants.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Brak uczestników — dodaj ich z listy zarejestrowanych.
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Uczestnik</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">Firma</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => {
                const cfg = STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.active;
                const loading = statusPending === p.id;
                return (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{p.display_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">
                      {p.company ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {p.status !== "active" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={loading || isLive}
                            onClick={() => handleStatus(p.id, "active")}
                            title={isLive ? "Zablokowane w trakcie biegu" : "Oznacz jako aktywny"}
                          >
                            <UserCheck className="size-3.5" />
                          </Button>
                        )}
                        {p.status !== "absent" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={loading || isLive}
                            onClick={() => handleStatus(p.id, "absent")}
                            title={isLive ? "Zablokowane w trakcie biegu" : "Oznacz jako nieobecny"}
                          >
                            <Clock className="size-3.5" />
                          </Button>
                        )}
                        {p.status !== "dropped" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={loading || isLive}
                            onClick={() => handleStatus(p.id, "dropped")}
                            className="text-destructive hover:text-destructive"
                            title={isLive ? "Zablokowane w trakcie biegu" : "Usuń z mixera"}
                          >
                            <UserX className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
