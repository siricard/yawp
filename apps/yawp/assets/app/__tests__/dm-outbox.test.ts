import {
  appendDmItem,
  decideDmSend,
  flushQueued,
  hasQueued,
  type DmOutboxItem,
} from '../chat/dm-outbox';

describe('decideDmSend', () => {
  test('rejects empty bodies', () => {
    expect(decideDmSend('   ', false)).toEqual({
      accepted: false,
      reason: 'empty',
    });
  });

  test('accepts a send when not degraded', () => {
    expect(decideDmSend('hello', false)).toEqual({accepted: true});
  });

  test('rejects a send as degraded when degraded', () => {
    expect(decideDmSend('hello', true)).toEqual({
      accepted: false,
      reason: 'degraded',
    });
  });
});

describe('dm outbox queue', () => {
  test('flushQueued promotes queued items to sent', () => {
    const items: DmOutboxItem[] = [
      {id: '1', body: 'a', delivery: 'sent'},
      {id: '2', body: 'b', delivery: 'queued'},
    ];
    const flushed = flushQueued(items);
    expect(flushed.map(i => i.delivery)).toEqual(['sent', 'sent']);
    expect(hasQueued(flushed)).toBe(false);
  });

  test('hasQueued detects queued items', () => {
    expect(hasQueued([{id: '1', body: 'a', delivery: 'queued'}])).toBe(true);
    expect(hasQueued([{id: '1', body: 'a', delivery: 'sent'}])).toBe(false);
  });

  test('appendDmItem is immutable', () => {
    const items: DmOutboxItem[] = [];
    const next = appendDmItem(items, {id: '1', body: 'a', delivery: 'sent'});
    expect(items).toHaveLength(0);
    expect(next).toHaveLength(1);
  });
});
