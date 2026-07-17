import Link from "next/link";
import { Radio } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-accent ring-1 ring-accent/30 transition group-hover:bg-accent/30">
            <Radio className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-wide text-foreground">
              Sharing Music
            </p>
            <p className="text-xs text-muted">Listen together</p>
          </div>
        </Link>

        <nav className="flex items-center gap-3">
          <Link
            href="/create"
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:bg-accent-hover"
          >
            Create room
          </Link>
        </nav>
      </div>
    </header>
  );
}
