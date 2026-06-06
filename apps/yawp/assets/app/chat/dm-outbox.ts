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
