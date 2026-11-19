type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export function readServerConfig(environment: ServerEnvironment = process.env) {
  const emailNotificationsEnabled = environment.EMAIL_NOTIFICATIONS_ENABLED === 'true';
  const autoTranslationEnabled = environment.AUTO_TRANSLATION_ENABLED === 'true';
  const analyticsEnabled = environment.ANALYTICS_ENABLED === 'true';
  // Ratings stay hidden until members can rate a recipe in the UI.
  const ratingsEnabled = environment.RATINGS_ENABLED === 'true';
  // The header's English/Español switch stays hidden until both languages are ready.
  const languageSwitchEnabled = environment.LANGUAGE_SWITCH_ENABLED === 'true';
  if (emailNotificationsEnabled && (!environment.RESEND_API_KEY || !environment.RESEND_FROM_EMAIL || environment.RESEND_DOMAIN_VERIFIED !== 'true')) {
    throw new Error('Email notifications require verified server configuration');
  }
  if (autoTranslationEnabled) {
    throw new Error('Automatic translation requires an approved provider and budget');
  }
  // Tag Manager and PostHog still load only after per-device consent (see features/consent).
  const gtmContainerId = environment.GTM_CONTAINER_ID?.trim() ?? '';
  const gtmConfigured = /^GTM-[A-Z0-9]+$/.test(gtmContainerId);
  const posthogToken = environment.PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ?? '';
  const posthogHost = httpsOrigin(environment.PUBLIC_POSTHOG_HOST);
  const posthogConfigured = /^ph[a-z]_[A-Za-z0-9]+$/.test(posthogToken) && posthogHost !== null;
  if (analyticsEnabled && !gtmConfigured && !posthogConfigured) {
    throw new Error('Analytics require verified server configuration and per-device consent');
  }
  return Object.freeze({
    emailNotificationsEnabled, autoTranslationEnabled, analyticsEnabled, ratingsEnabled, languageSwitchEnabled,
    gtmContainerId: analyticsEnabled && gtmConfigured ? gtmContainerId : null,
    posthog: analyticsEnabled && posthogConfigured ? Object.freeze({ token: posthogToken, host: posthogHost! }) : null,
  });
}

function httpsOrigin(value: string | undefined) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' ? url.origin : null; } catch { return null; }
}

// Invoke providers lazily: disabled features must never import or call an SDK.
export async function runOptionalAdapter<T>(enabled: boolean, operation: () => Promise<T> | T) {
  if (!enabled) return { status: 'disabled' as const };
  return { status: 'completed' as const, value: await operation() };
}
