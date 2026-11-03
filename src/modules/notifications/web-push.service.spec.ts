import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendNotification, setVapidDetails } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));
vi.mock('web-push', () => ({
  default: { sendNotification, setVapidDetails },
}));

import { WebPushService } from './web-push.service.js';

const USER_ID = '507f1f77bcf86cd799439011';
const subscription = {
  _id: 'sub-1',
  endpoint: 'https://push.example.com/abc',
  keys: { p256dh: 'p', auth: 'a' },
};

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as any;

const VAPID = {
  VAPID_PUBLIC_KEY: 'public',
  VAPID_PRIVATE_KEY: 'private',
  VAPID_SUBJECT: 'mailto:admin@example.com',
};

describe('WebPushService', () => {
  let model: any;

  beforeEach(() => {
    sendNotification.mockReset();
    model = {
      find: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([subscription]) })),
      deleteOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    };
  });

  it('is disabled without VAPID keys', async () => {
    const service = new WebPushService(config({}), model);

    expect(service.getPublicKey()).toEqual({ enabled: false, publicKey: null });
    await service.sendToUsers([USER_ID], { title: 't', body: 'b' });
    expect(model.find).not.toHaveBeenCalled();
  });

  it('sends the payload to every browser of the users', async () => {
    const service = new WebPushService(config(VAPID), model);
    sendNotification.mockResolvedValue({});

    await service.sendToUsers([USER_ID], { title: 't', body: 'b', link: '/x' });

    expect(model.find).toHaveBeenCalledWith({ user: { $in: [USER_ID] } });
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify({ title: 't', body: 'b', link: '/x' }),
      { TTL: 86400 },
    );
  });

  it('removes a subscription the browser no longer accepts', async () => {
    const service = new WebPushService(config(VAPID), model);
    sendNotification.mockRejectedValue({ statusCode: 410 });

    await service.sendToUsers([USER_ID], { title: 't', body: 'b' });

    expect(model.deleteOne).toHaveBeenCalledWith({ _id: 'sub-1' });
  });

  it('keeps the subscription on a temporary error and never throws', async () => {
    const service = new WebPushService(config(VAPID), model);
    sendNotification.mockRejectedValue({ statusCode: 500 });

    await expect(
      service.sendToUsers([USER_ID], { title: 't', body: 'b' }),
    ).resolves.toBeUndefined();
    expect(model.deleteOne).not.toHaveBeenCalled();
  });

  it('moves a browser subscription to the user who subscribes', async () => {
    const service = new WebPushService(config(VAPID), model);

    await service.subscribe(USER_ID, subscription);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { endpoint: subscription.endpoint },
      {
        user: USER_ID,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      expect.objectContaining({ upsert: true }),
    );
  });
});
