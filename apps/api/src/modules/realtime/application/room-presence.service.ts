import { Injectable } from '@nestjs/common';

export type LiveParticipant = {
  userId: string;
  displayName: string;
  role?: string;
};

type PresenceEntry = {
  sockets: Set<string>;
  displayName: string;
  role?: string;
};

/**
 * In-memory live presence: RoomMember (DB) ≠ currently connected.
 * Resets to empty on API process restart; rebuilds as sockets rejoin.
 */
@Injectable()
export class RoomPresenceService {
  /** roomId → userId → presence entry */
  private readonly presence = new Map<string, Map<string, PresenceEntry>>();

  add(
    roomId: string,
    userId: string,
    socketId: string,
    meta?: { displayName?: string; role?: string },
  ): {
    listenerCount: number;
    becameOnline: boolean;
  } {
    if (!this.presence.has(roomId)) {
      this.presence.set(roomId, new Map());
    }
    const roomMap = this.presence.get(roomId)!;
    const existing = roomMap.get(userId);
    const wasOnline = Boolean(existing);
    if (!existing) {
      roomMap.set(userId, {
        sockets: new Set([socketId]),
        displayName: meta?.displayName?.trim() || 'Guest',
        role: meta?.role,
      });
    } else {
      existing.sockets.add(socketId);
      if (meta?.displayName?.trim()) {
        existing.displayName = meta.displayName.trim();
      }
      if (meta?.role) {
        existing.role = meta.role;
      }
    }
    return {
      listenerCount: roomMap.size,
      becameOnline: !wasOnline,
    };
  }

  /**
   * @returns whether the user left live presence entirely (no sockets left).
   */
  remove(
    roomId: string,
    userId: string,
    socketId: string,
  ): { leftFully: boolean; listenerCount: number } {
    const roomMap = this.presence.get(roomId);
    if (!roomMap) {
      return { leftFully: true, listenerCount: 0 };
    }
    const entry = roomMap.get(userId);
    if (!entry) {
      return { leftFully: true, listenerCount: roomMap.size };
    }
    entry.sockets.delete(socketId);
    let leftFully = false;
    if (entry.sockets.size === 0) {
      roomMap.delete(userId);
      leftFully = true;
    }
    if (roomMap.size === 0) {
      this.presence.delete(roomId);
    }
    return {
      leftFully,
      listenerCount: this.getListenerCount(roomId),
    };
  }

  getListenerCount(roomId: string): number {
    return this.presence.get(roomId)?.size ?? 0;
  }

  getLiveUserIds(roomId: string): string[] {
    const roomMap = this.presence.get(roomId);
    if (!roomMap) {
      return [];
    }
    return [...roomMap.keys()];
  }

  getLiveParticipants(roomId: string): LiveParticipant[] {
    const roomMap = this.presence.get(roomId);
    if (!roomMap) {
      return [];
    }
    return [...roomMap.entries()].map(([userId, entry]) => ({
      userId,
      displayName: entry.displayName,
      role: entry.role,
    }));
  }

  /** Lightweight snapshot for presence.updated broadcasts. */
  getPresenceSnapshot(roomId: string): {
    listenerCount: number;
    liveUserIds: string[];
    liveParticipants: LiveParticipant[];
  } {
    const liveParticipants = this.getLiveParticipants(roomId);
    return {
      listenerCount: liveParticipants.length,
      liveUserIds: liveParticipants.map((p) => p.userId),
      liveParticipants,
    };
  }

  getListenerCounts(roomIds: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const roomId of roomIds) {
      counts[roomId] = this.getListenerCount(roomId);
    }
    return counts;
  }

  /** Test helper — wipe all presence (simulates process restart). */
  resetAll(): void {
    this.presence.clear();
  }
}
