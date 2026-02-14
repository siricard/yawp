
import {useCallback, useEffect, useState} from 'react';

import {
  listRooms,
  createRoom,
  joinRoom,
} from '../ash_generated';
import type {AshRpcError, RoomResourceSchema} from '../ash_types';

function csrfHeaders(): Record<string, string> {
  if (typeof document === 'undefined') {
    return {};
  }
  const token =
    document
      .querySelector("meta[name='csrf-token']")
      ?.getAttribute('content') ?? null;
  return token ? {'X-CSRF-Token': token} : {};
}

export type RoomSummary = Pick<
  RoomResourceSchema,
  'id' | 'name' | 'members' | 'createdByDid'
>;

export type RoomListState =
  | {status: 'loading'; rooms: RoomSummary[]; error: null}
  | {status: 'ready'; rooms: RoomSummary[]; error: null}
  | {status: 'error'; rooms: RoomSummary[]; error: string};

const ROOM_FIELDS: Array<'id' | 'name' | 'members' | 'createdByDid'> = [
  'id',
  'name',
  'members',
  'createdByDid',
];

type RpcFailure = {success: false; errors: AshRpcError[]};

function describeErrors(result: RpcFailure): string {
  if (!result.errors || result.errors.length === 0) {
    return 'unknown_rpc_error';
  }
  return result.errors
    .map(e => e.shortMessage || e.message || e.type)
    .filter(Boolean)
    .join('; ');
}

function shapeRoom(r: unknown): RoomSummary | null {
  if (typeof r !== 'object' || r === null) {
    return null;
  }
  const o = r as {
    id?: unknown;
    name?: unknown;
    members?: unknown;
    createdByDid?: unknown;
  };
  if (typeof o.id !== 'string' || typeof o.name !== 'string') {
    return null;
  }
  const members = Array.isArray(o.members)
    ? o.members.filter((m): m is string => typeof m === 'string')
    : [];
  return {
    id: o.id,
    name: o.name,
    members,
    createdByDid: typeof o.createdByDid === 'string' ? o.createdByDid : '',
  };
}

function shapeRooms(arr: unknown): RoomSummary[] {
  if (!Array.isArray(arr)) {
    return [];
  }
  const out: RoomSummary[] = [];
  for (const item of arr) {
    const s = shapeRoom(item);
    if (s) {
      out.push(s);
    }
  }
  return out;
}

/**
 * @param did The current authenticated DID. When null, the hook stays in
 *   `loading` and does not issue RPCs. Pass null to render an
 *   "authenticate first" empty state.
 */
export function useRoomList(did: string | null): {
  state: RoomListState;
  refresh: () => Promise<void>;
  createRoom: (name: string) => Promise<RoomSummary | null>;
  joinRoom: (roomId: string) => Promise<RoomSummary | null>;
} {
  const [state, setState] = useState<RoomListState>({
    status: 'loading',
    rooms: [],
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!did) {
      return;
    }
    const result = await listRooms({
      fields: ROOM_FIELDS,
      headers: csrfHeaders(),
    });
    if (!result.success) {
      setState(prev => ({
        status: 'error',
        rooms: prev.rooms,
        error: describeErrors(result),
      }));
      return;
    }
    setState({
      status: 'ready',
      rooms: shapeRooms(result.data),
      error: null,
    });
  }, [did]);

  useEffect(() => {
    if (!did) {
      return;
    }
    let cancelled = false;
    listRooms({fields: ROOM_FIELDS, headers: csrfHeaders()})
      .then(result => {
        if (cancelled) {
          return;
        }
        if (!result.success) {
          setState({
            status: 'error',
            rooms: [],
            error: describeErrors(result),
          });
          return;
        }
        setState({
          status: 'ready',
          rooms: shapeRooms(result.data),
          error: null,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) {
          return;
        }
        setState({
          status: 'error',
          rooms: [],
          error: (e as Error)?.message ?? String(e),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [did]);

  const createRoomCb = useCallback(
    async (name: string): Promise<RoomSummary | null> => {
      if (!did) {
        return null;
      }
      const trimmed = name.trim();
      if (!trimmed) {
        return null;
      }
      const result = await createRoom({
        input: {name: trimmed, createdByDid: did},
        fields: ROOM_FIELDS,
        headers: csrfHeaders(),
      });
      if (!result.success) {
        setState(prev => ({
          status: 'error',
          rooms: prev.rooms,
          error: describeErrors(result),
        }));
        return null;
      }
      const room = shapeRoom(result.data);
      if (!room) {
        return null;
      }
      setState(prev => ({
        status: 'ready',
        rooms: [...prev.rooms, room],
        error: null,
      }));
      return room;
    },
    [did],
  );

  const joinRoomCb = useCallback(
    async (roomId: string): Promise<RoomSummary | null> => {
      if (!did) {
        return null;
      }
      const result = await joinRoom({
        identity: roomId,
        input: {did},
        fields: ROOM_FIELDS,
        headers: csrfHeaders(),
      });
      if (!result.success) {
        setState(prev => ({
          status: 'error',
          rooms: prev.rooms,
          error: describeErrors(result),
        }));
        return null;
      }
      const room = shapeRoom(result.data);
      if (!room) {
        return null;
      }
      setState(prev => ({
        status: 'ready',
        rooms: prev.rooms.some(r => r.id === room.id)
          ? prev.rooms.map(r => (r.id === room.id ? room : r))
          : [...prev.rooms, room],
        error: null,
      }));
      return room;
    },
    [did],
  );

  return {
    state,
    refresh,
    createRoom: createRoomCb,
    joinRoom: joinRoomCb,
  };
}
