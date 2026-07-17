/**
 * Public runtime config for the Nest API + Socket.IO.
 * Defaults match local Phase 2/3 development.
 */
export function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
    "http://localhost:3001/api/v1"
  );
}

/** Origin used for Socket.IO and static uploads (/uploads/...). */
export function getApiOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SOCKET_URL?.replace(/\/$/, "");
  if (explicit) {
    return explicit;
  }

  try {
    const api = new URL(getApiBaseUrl());
    return api.origin;
  } catch {
    return "http://localhost:3001";
  }
}

export function getSocketUrl(): string {
  return getApiOrigin();
}

/** Resolve relative API media paths (voice) to absolute URLs. */
export function resolveMediaUrl(path: string | null | undefined): string | undefined {
  if (!path) {
    return undefined;
  }
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("blob:") ||
    path.startsWith("data:")
  ) {
    return path;
  }
  const origin = getApiOrigin();
  return path.startsWith("/") ? `${origin}${path}` : `${origin}/${path}`;
}
