import Link from "next/link";
import { RoomList } from "@/components/RoomList";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <section className="mb-10 rounded-3xl border border-border bg-surface/70 p-8 sm:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent">
          Social listening
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Join a room and feel the music together.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted">
          Join a room, play YouTube embeds, cast one vote for the next track,
          and chat in sync — rooms are persisted on the API and updated over
          Socket.IO.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/create"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover"
          >
            Create a room
          </Link>
          <a
            href="#rooms"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent"
          >
            Browse rooms
          </a>
        </div>
      </section>

      <section id="rooms">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Public rooms</h2>
            <p className="mt-1 text-sm text-muted">
              Live sessions you can join right now.
            </p>
          </div>
        </div>

        <RoomList />
      </section>
    </div>
  );
}
