export type DmDelivery = 'sent' | 'queued';

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
