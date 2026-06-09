export type DmDelivery = 'sending' | 'sent' | 'delivered' | 'read' | 'queued';

export type DmOutboxItem = {
  id: string;
  body: string;
  delivery: DmDelivery;
};

export type DmSendDecision =
  | {accepted: true}
  | {accepted: false; reason: 'degraded' | 'empty'};

export function decideDmSend(body: string, degraded: boolean): DmSendDecision {
  if (body.trim().length === 0) return {accepted: false, reason: 'empty'};
  if (degraded) return {accepted: false, reason: 'degraded'};
  return {accepted: true};
}

export function appendDmItem(
  items: DmOutboxItem[],
  item: DmOutboxItem,
): DmOutboxItem[] {
  return [...items, item];
}

export function flushQueued(items: DmOutboxItem[]): DmOutboxItem[] {
  return items.map(item =>
    item.delivery === 'queued' ? {...item, delivery: 'sent'} : item,
  );
}

export function hasQueued(items: DmOutboxItem[]): boolean {
  return items.some(item => item.delivery === 'queued');
}

export type PerRecipientDelivery = {
  recipientDid: string;
  state: Exclude<DmDelivery, 'queued' | 'sending'>;
};

export type DeliveryStateMap = Record<string, PerRecipientDelivery[]>;

const DELIVERY_RANK: Record<'sent' | 'delivered' | 'read', number> = {
  sent: 0,
  delivered: 1,
  read: 2,
};

export function mergeDeliveryStateMap(
  map: DeliveryStateMap,
  event: {envelope_id: string; recipient_did: string; state: 'sent' | 'delivered' | 'read'},
): DeliveryStateMap {
  const existing = map[event.envelope_id] ?? [];
  const withoutRecipient = existing.filter(state => state.recipientDid !== event.recipient_did);
  return {
    ...map,
    [event.envelope_id]: [
      ...withoutRecipient,
      {recipientDid: event.recipient_did, state: event.state},
    ],
  };
}

/**
 * Overlays retained per-recipient delivery state (keyed by envelope id) onto a
 * thread message. Retaining the state in a map lets a `delivery_state` event
 * that races ahead of the optimistic→server id swap still land once the
 * message adopts its server envelope id.
 */
export function applyDeliveryState<
  T extends {
    id: string;
    delivery: DmDelivery;
    recipientDids?: string[];
    deliveryStates?: PerRecipientDelivery[];
  },
>(item: T, map: DeliveryStateMap): T {
  const incoming = map[item.id];
  if (!incoming || incoming.length === 0) return item;
  if (item.delivery === 'queued' || item.delivery === 'sending') return item;

  const byRecipient = new Map<string, PerRecipientDelivery>();
  for (const state of item.deliveryStates ?? []) byRecipient.set(state.recipientDid, state);
  for (const state of incoming) byRecipient.set(state.recipientDid, state);
  const merged = Array.from(byRecipient.values());

  const highest = merged.reduce<PerRecipientDelivery['state']>((acc, state) => {
    return DELIVERY_RANK[state.state] > DELIVERY_RANK[acc] ? state.state : acc;
  }, 'sent');

  return {...item, deliveryStates: merged, delivery: highest};
}

export function aggregateDelivery(
  states: PerRecipientDelivery[],
  recipientDids: string[],
): {delivered: number; read: number; total: number; label: string} {
  const recipients = Array.from(new Set(recipientDids));
  const delivered = new Set<string>();
  const read = new Set<string>();

  for (const state of states) {
    if (!recipients.includes(state.recipientDid)) continue;
    if (state.state === 'delivered' || state.state === 'read') delivered.add(state.recipientDid);
    if (state.state === 'read') read.add(state.recipientDid);
  }

  const total = recipients.length;
  return {
    delivered: delivered.size,
    read: read.size,
    total,
    label: `delivered to ${delivered.size}/${total}, read by ${read.size}/${total}`,
  };
}
