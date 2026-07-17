import { RoomPresenceService } from './room-presence.service';

describe('RoomPresenceService', () => {
  let presence: RoomPresenceService;

  beforeEach(() => {
    presence = new RoomPresenceService();
  });

  it('starts at 0 after construction (API restart)', () => {
    expect(presence.getListenerCount('room-1')).toBe(0);
  });

  it('counts unique users, not sockets', () => {
    presence.add('room-1', 'user-a', 'sock-1', { displayName: 'Ada' });
    presence.add('room-1', 'user-a', 'sock-2', { displayName: 'Ada' });
    presence.add('room-1', 'user-b', 'sock-3', { displayName: 'Bob' });
    expect(presence.getListenerCount('room-1')).toBe(2);
    expect(presence.getLiveUserIds('room-1').sort()).toEqual([
      'user-a',
      'user-b',
    ]);
    expect(presence.getPresenceSnapshot('room-1').liveParticipants).toEqual([
      { userId: 'user-a', displayName: 'Ada', role: undefined },
      { userId: 'user-b', displayName: 'Bob', role: undefined },
    ]);
  });

  it('does not drop a user until their last socket disconnects', () => {
    presence.add('room-1', 'user-a', 'sock-1', { displayName: 'Ada' });
    presence.add('room-1', 'user-a', 'sock-2', { displayName: 'Ada' });
    const first = presence.remove('room-1', 'user-a', 'sock-1');
    expect(first.leftFully).toBe(false);
    expect(first.listenerCount).toBe(1);

    const last = presence.remove('room-1', 'user-a', 'sock-2');
    expect(last.leftFully).toBe(true);
    expect(last.listenerCount).toBe(0);
    expect(presence.getPresenceSnapshot('room-1').liveParticipants).toEqual([]);
  });

  it('resetAll clears presence like a process restart', () => {
    presence.add('room-1', 'user-a', 'sock-1', { displayName: 'Ada' });
    presence.add('room-2', 'user-b', 'sock-2', { displayName: 'Bob' });
    presence.resetAll();
    expect(presence.getListenerCount('room-1')).toBe(0);
    expect(presence.getListenerCount('room-2')).toBe(0);
  });
});
