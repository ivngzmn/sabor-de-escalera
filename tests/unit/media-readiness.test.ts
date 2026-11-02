import { afterEach, expect, test, vi } from 'vitest';
import { mediaReadiness } from '../../src/features/media/service';

afterEach(() => vi.unstubAllEnvs());
const keys = { IMAGEKIT_PRIVATE_KEY: 'private', IMAGEKIT_PUBLIC_KEY: 'public', IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/test' };

test('media stays off unless a provider is chosen', () => {
  expect(mediaReadiness({})).toMatchObject({ enabled: false, provider: null });
  expect(mediaReadiness(keys)).toMatchObject({ enabled: false, provider: null, configured: true });
});

test('ImageKit needs keys and a recorded live proof date', () => {
  expect(mediaReadiness({ MEDIA_PROVIDER: 'imagekit', ...keys })).toMatchObject({ enabled: false });
  expect(mediaReadiness({ MEDIA_PROVIDER: 'imagekit', ...keys, MEDIA_LIVE_PROOF_PASSED: 'yes' })).toMatchObject({ enabled: false });
  expect(mediaReadiness({ MEDIA_PROVIDER: 'imagekit', IMAGEKIT_PUBLIC_KEY: 'public', MEDIA_LIVE_PROOF_PASSED: '2026-11-02' })).toMatchObject({ enabled: false });
  expect(mediaReadiness({ MEDIA_PROVIDER: 'imagekit', ...keys, MEDIA_LIVE_PROOF_PASSED: '2026-11-02' })).toMatchObject({ enabled: true, provider: 'imagekit' });
});

test('the local provider never runs in production or on Vercel', () => {
  expect(mediaReadiness({ MEDIA_PROVIDER: 'local', NODE_ENV: 'development' })).toMatchObject({ enabled: true, provider: 'local' });
  expect(mediaReadiness({ MEDIA_PROVIDER: 'local', NODE_ENV: 'production' })).toMatchObject({ enabled: false });
  expect(mediaReadiness({ MEDIA_PROVIDER: 'local', NODE_ENV: 'development', VERCEL: '1' })).toMatchObject({ enabled: false });
});

test('a production build refuses the local provider even when NODE_ENV is unset', () => {
  vi.stubEnv('DEV', false);
  expect(mediaReadiness({ MEDIA_PROVIDER: 'local' })).toMatchObject({ enabled: false });
});
