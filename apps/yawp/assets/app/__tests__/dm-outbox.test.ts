import {
  appendDmItem,
  applyDeliveryState,
  decideDmSend,
  flushQueued,
  hasQueued,
  mergeDeliveryStateMap,
  type DeliveryStateMap,
  type DmDelivery,
  type DmOutboxItem,
  type PerRecipientDelivery,
} from '../chat/dm-outbox';

type OverlayBubble = {
  id: string;
  delivery: DmDelivery;
  recipientDids?: string[];
  deliveryStates?: PerRecipientDelivery[];
};

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

describe('delivery-state overlay map (id-swap race)', () => {
  test('mergeDeliveryStateMap keys retained state by envelope id', () => {
    const map = mergeDeliveryStateMap(
      {},
      {envelope_id: 'env-1', recipient_did: 'did:yawp:bob', state: 'delivered'},
    );
    expect(map['env-1']).toEqual([{recipientDid: 'did:yawp:bob', state: 'delivered'}]);
  });

  test('mergeDeliveryStateMap replaces the per-recipient entry on upgrade', () => {
    const first = mergeDeliveryStateMap(
      {},
      {envelope_id: 'env-1', recipient_did: 'did:yawp:bob', state: 'delivered'},
    );
    const second = mergeDeliveryStateMap(first, {
      envelope_id: 'env-1',
      recipient_did: 'did:yawp:bob',
      state: 'read',
    });
    expect(second['env-1']).toEqual([{recipientDid: 'did:yawp:bob', state: 'read'}]);
  });

  test('a delivery_state that raced ahead applies once the id settles to the envelope id', () => {
    // The event arrived while the bubble still had its local id, so it was
    // retained in the map keyed by the server envelope id.
    const map: DeliveryStateMap = mergeDeliveryStateMap(
      {},
      {envelope_id: 'env-1', recipient_did: 'did:yawp:bob', state: 'delivered'},
    );

    // Still the optimistic local id — overlay does not apply yet.
    const optimistic = applyDeliveryState<OverlayBubble>(
      {id: 'local-123', delivery: 'sent', recipientDids: ['did:yawp:bob']},
      map,
    );
    expect(optimistic.delivery).toBe('sent');
    expect(optimistic.deliveryStates).toBeUndefined();

    // After the POST resolves the bubble adopts the server envelope id; the
    // retained overlay now re-applies.
    const settled = applyDeliveryState<OverlayBubble>(
      {id: 'env-1', delivery: 'sent', recipientDids: ['did:yawp:bob']},
      map,
    );
    expect(settled.delivery).toBe('delivered');
    expect(settled.deliveryStates).toEqual([
      {recipientDid: 'did:yawp:bob', state: 'delivered'},
    ]);
  });

  test('overlay updates the group aggregate to the highest reached state', () => {
    let map: DeliveryStateMap = {};
    map = mergeDeliveryStateMap(map, {
      envelope_id: 'env-1',
      recipient_did: 'did:yawp:bob',
      state: 'read',
    });
    map = mergeDeliveryStateMap(map, {
      envelope_id: 'env-1',
      recipient_did: 'did:yawp:carol',
      state: 'delivered',
    });

    const item = applyDeliveryState<OverlayBubble>(
      {
        id: 'env-1',
        delivery: 'sent',
        recipientDids: ['did:yawp:bob', 'did:yawp:carol'],
      },
      map,
    );

    expect(item.delivery).toBe('read');
    expect(item.deliveryStates).toEqual([
      {recipientDid: 'did:yawp:bob', state: 'read'},
      {recipientDid: 'did:yawp:carol', state: 'delivered'},
    ]);
  });

  test('queued and sending bubbles are never overwritten by an overlay', () => {
    const map = mergeDeliveryStateMap(
      {},
      {envelope_id: 'env-1', recipient_did: 'did:yawp:bob', state: 'delivered'},
    );
    expect(
      applyDeliveryState<OverlayBubble>({id: 'env-1', delivery: 'queued'}, map).delivery,
    ).toBe('queued');
    expect(
      applyDeliveryState<OverlayBubble>({id: 'env-1', delivery: 'sending'}, map).delivery,
    ).toBe('sending');
  });
});
