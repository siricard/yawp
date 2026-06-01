import {banServerMember, kickServerMember} from '../server-moderation';

jest.mock('../session', () => ({
  getValidSessionToken: jest.fn(),
}));

jest.mock('../ash_generated', () => ({
  kickMember: jest.fn(),
  banMember: jest.fn(),
}));

import {getValidSessionToken} from '../session';
import {banMember, kickMember} from '../ash_generated';

const mockSession = getValidSessionToken as jest.Mock;
const mockKick = kickMember as jest.Mock;
const mockBan = banMember as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({ok: true, sessionToken: 'sess-123'});
});

describe('kickServerMember', () => {
  it('forwards did + Authorization header and reports success', async () => {
    mockKick.mockResolvedValue({success: true, data: {id: 'k1'}});

    const result = await kickServerMember({
      serverUrl: 'http://localhost:4000',
      serverId: 'srv-1',
      did: 'did:yawp:bob',
    });

    expect(result.ok).toBe(true);
    const config = mockKick.mock.calls[0][0];
    expect(config.input).toMatchObject({
      serverId: 'srv-1',
      did: 'did:yawp:bob',
      identityId: null,
    });
    expect(config.headers.Authorization).toBe('Bearer sess-123');
  });

  it('surfaces the RPC error slug message', async () => {
    mockKick.mockResolvedValue({
      success: false,
      errors: [{type: 'missing_permission', message: 'kick_members'}],
    });

    const result = await kickServerMember({
      serverUrl: 'http://localhost:4000',
      serverId: 'srv-1',
      did: 'did:yawp:bob',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('missing_permission');
    }
  });

  it('fails when there is no session', async () => {
    mockSession.mockResolvedValue({ok: false, reason: 'no_session'});

    const result = await kickServerMember({
      serverUrl: 'http://localhost:4000',
      serverId: 'srv-1',
      did: 'did:yawp:bob',
    });

    expect(result.ok).toBe(false);
    expect(mockKick).not.toHaveBeenCalled();
  });
});

describe('banServerMember', () => {
  it('calls banMember and reports success', async () => {
    mockBan.mockResolvedValue({success: true, data: {id: 'b1'}});

    const result = await banServerMember({
      serverUrl: 'http://localhost:4000',
      serverId: 'srv-1',
      did: 'did:yawp:bob',
    });

    expect(result.ok).toBe(true);
    expect(mockBan).toHaveBeenCalledTimes(1);
  });
});
