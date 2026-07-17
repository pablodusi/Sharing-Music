import Link from "next/link";
import { Headphones, Lock } from "lucide-react";
import type { Room } from "@/lib/types";

type RoomCardProps = {
  room: Room;
};

export function RoomCard({ room }: RoomCardProps) {
  return (
    <Link
      href={`/rooms/${room.id}`}
      className="group flex flex-col rounded-2xl border border-border bg-surface-elevated p-5 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-glow"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            {room.genre}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground group-hover:text-accent">
            {room.name}
          </h2>
        </div>
        {room.isPrivate ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-xs text-muted">
            <Lock className="h-3 w-3" />
            Private
          </span>
        ) : null}
      </div>

      <p className="mb-4 line-clamp-2 text-sm text-muted">{room.description}</p>

      <div className="mt-auto space-y-3">
        <div className="rounded-xl bg-black/20 px-3 py-2">
          <p className="text-xs text-muted">Now playing</p>
          {room.currentTrack ? (
            <>
              <p className="truncate text-sm font-medium text-foreground">
                {room.currentTrack.track.title}
              </p>
              <p className="truncate text-xs text-muted">
                {room.currentTrack.track.artist}
              </p>
            </>
          ) : (
            <p className="text-sm font-medium text-muted">Nothing yet — search to start</p>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Headphones className="h-3.5 w-3.5" />
            {room.listenerCount} listening
          </span>
          <span>Host · {room.host}</span>
        </div>
      </div>
    </Link>
  );
}
