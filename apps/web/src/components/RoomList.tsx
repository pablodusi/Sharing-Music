"use client";

import { useCallback, useEffect, useState } from "react";
import { RoomCard } from "@/components/RoomCard";
import { listPublicRooms } from "@/lib/api/client";
import { mapSummaryToRoom } from "@/lib/api/snapshot";
import type { Room } from "@/lib/types";

const REFRESH_MS = 8_000;

export function RoomList() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const summaries = await listPublicRooms();
      setRooms(summaries.map(mapSummaryToRoom));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load rooms. Is the API running?",
      );
      if (!opts?.silent) {
        setRooms([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const interval = window.setInterval(() => {
      void refresh({ silent: true });
    }, REFRESH_MS);

    function onVisible() {
      if (document.visibilityState === "visible") {
        void refresh({ silent: true });
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  if (loading && rooms.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-muted">
        Loading rooms…
      </p>
    );
  }

  if (error && rooms.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-danger/40 px-6 py-12 text-center text-danger">
        {error}
      </p>
    );
  }

  if (rooms.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-muted">
        No public rooms yet. Be the first to create one.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map((room) => (
        <RoomCard key={room.id} room={room} />
      ))}
    </div>
  );
}
