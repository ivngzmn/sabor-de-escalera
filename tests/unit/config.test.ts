import { expect, test } from 'vitest';

import { readServerConfig, runOptionalAdapter } from '../../src/server/config';

test('missing secrets leave all optional providers disabled', () => {
  expect(readServerConfig({})).toMatchObject({
    emailNotificationsEnabled: false,
    autoTranslationEnabled: false,
    analyticsEnabled: false,
    ratingsEnabled: false,
  });
});

test('ratings turn on only with the exact flag value', () => {
  expect(readServerConfig({ RATINGS_ENABLED: 'true' }).ratingsEnabled).toBe(true);
  expect(readServerConfig({ RATINGS_ENABLED: 'yes' }).ratingsEnabled).toBe(false);
  expect(readServerConfig({}).languageSwitchEnabled).toBe(false);
  expect(readServerConfig({ LANGUAGE_SWITCH_ENABLED: 'true' }).languageSwitchEnabled).toBe(true);
});

test('truthy flag typos cannot activate paid or consent-dependent providers', () => {
  expect(readServerConfig({ EMAIL_NOTIFICATIONS_ENABLED: 'yes', AUTO_TRANSLATION_ENABLED: '1', ANALYTICS_ENABLED: 'TRUE' })).toMatchObject({
    emailNotificationsEnabled: false, autoTranslationEnabled: false, analyticsEnabled: false,
  });
});

test('disabled adapter returns disabled without executing provider work', async () => {
  const result = await runOptionalAdapter(false, () => { throw new Error('External provider work must not run'); });
  expect(result).toEqual({ status: 'disabled' });
});

test('enabled but unconfigured providers fail closed without revealing credentials', () => {
  expect(() => readServerConfig({ EMAIL_NOTIFICATIONS_ENABLED: 'true' })).toThrow('Email notifications require verified server configuration');
});

test('analytics need a valid Tag Manager container id and expose it only when enabled', () => {
  expect(() => readServerConfig({ ANALYTICS_ENABLED: 'true' })).toThrow('Analytics require verified server configuration');
  expect(() => readServerConfig({ ANALYTICS_ENABLED: 'true', GTM_CONTAINER_ID: 'UA-123' })).toThrow();
  expect(readServerConfig({ ANALYTICS_ENABLED: 'true', GTM_CONTAINER_ID: 'GTM-5FWTF5RT' }).gtmContainerId).toBe('GTM-5FWTF5RT');
  expect(readServerConfig({ GTM_CONTAINER_ID: 'GTM-5FWTF5RT' }).gtmContainerId).toBeNull();
});
