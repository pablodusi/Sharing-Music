"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/lib/api/client";
import { ensureGuestIdentity } from "@/lib/guest-identity";
import { DEFAULT_GENRES } from "@/lib/mock-data";

export function CreateRoomForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState(DEFAULT_GENRES[0]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (name.trim().length < 3) {
      setError("Room name must be at least 3 characters.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const guest = ensureGuestIdentity();
      const desc = description.trim();
      const withGenre =
        genre && genre !== "Mixed"
          ? desc
            ? `${desc} · ${genre}`
            : `Genre: ${genre}`
          : desc;

      const snapshot = await createRoom(guest, {
        name: name.trim(),
        description: withGenre || undefined,
        isPrivate,
      });

      router.push(`/rooms/${snapshot.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create room. Is the API running?",
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-5 rounded-2xl border border-border bg-surface-elevated p-6 sm:p-8"
    >
      <div>
        <label htmlFor="name" className="mb-2 block text-sm font-medium text-foreground">
          Room name
        </label>
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Friday Night Vibes"
          className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground outline-none ring-accent/0 transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="mb-2 block text-sm font-medium text-foreground"
        >
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="What kind of music will you share?"
          className="w-full resize-none rounded-xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div>
        <label htmlFor="genre" className="mb-2 block text-sm font-medium text-foreground">
          Genre
        </label>
        <select
          id="genre"
          value={genre}
          onChange={(event) => setGenre(event.target.value)}
          className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
        >
          {DEFAULT_GENRES.map((option) => (
            <option key={option} value={option} className="bg-surface">
              {option}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-border bg-black/10 px-4 py-3 text-sm text-muted">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(event) => setIsPrivate(event.target.checked)}
          className="h-4 w-4 rounded border-border accent-accent"
        />
        Private room (members only after join)
      </label>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:opacity-60"
      >
        {submitting ? "Creating…" : "Create and enter room"}
      </button>
    </form>
  );
}
