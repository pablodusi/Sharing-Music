import { Crown } from "lucide-react";
import type { Participant } from "@/lib/types";

type ParticipantListProps = {
  participants: Participant[];
};

export function ParticipantList({ participants }: ParticipantListProps) {
  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
        In the room
      </h2>
      <ul className="space-y-3">
        {participants.map((participant) => (
          <li key={participant.id} className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: participant.avatarColor }}
            >
              {participant.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {participant.name}
              </p>
              {participant.isHost ? (
                <p className="inline-flex items-center gap-1 text-xs text-accent">
                  <Crown className="h-3 w-3" />
                  Host
                </p>
              ) : (
                <p className="text-xs text-muted">Listening</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
