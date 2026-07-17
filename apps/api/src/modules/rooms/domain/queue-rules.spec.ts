import {
  canRemoveQueueItem,
  canVoteOnQueueItem,
  getAddBlockReason,
  sortQueueByVotesThenAddedAt,
} from './queue-rules';

describe('queue-rules', () => {
  it('sorts by votes descending then oldest addedAt', () => {
    const sorted = sortQueueByVotesThenAddedAt([
      { id: 'c', votes: 1, addedAt: new Date('2026-01-03') },
      { id: 'a', votes: 5, addedAt: new Date('2026-01-02') },
      { id: 'b', votes: 5, addedAt: new Date('2026-01-01') },
      { id: 'd', votes: 0, addedAt: new Date('2026-01-01') },
    ]).map((item) => item.id);

    expect(sorted).toEqual(['b', 'a', 'c', 'd']);
  });

  it('enforces max queued songs per user', () => {
    const block = getAddBlockReason({
      userId: 'u1',
      queuedByUser: 3,
      nowPlayingAddedById: null,
      nowPlayingTitle: null,
    });
    expect(block).toEqual({ kind: 'queue_limit', count: 3, max: 3 });
  });

  it('blocks self-votes and locked removes', () => {
    expect(
      canVoteOnQueueItem({ addedById: 'u1', voterId: 'u1' }),
    ).toBe(false);
    expect(
      canRemoveQueueItem({ addedById: 'u1', userId: 'u1', voteCount: 1 }),
    ).toBe(false);
    expect(
      canRemoveQueueItem({ addedById: 'u1', userId: 'u1', voteCount: 0 }),
    ).toBe(true);
  });
});
