type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export function readServerConfig(environment: ServerEnvironment = process.env) {
  const emailNotificationsEnabled = environment.EMAIL_NOTIFICATIONS_ENABLED === 'true';
  const autoTranslationEnabled = environment.AUTO_TRANSLATION_ENABLED === 'true';
  const analyticsEnabled = environment.ANALYTICS_ENABLED === 'true';
  if (emailNotificationsEnabled && (!environment.RESEND_API_KEY || !environment.RESEND_FROM_EMAIL || environment.RESEND_DOMAIN_VERIFIED !== 'true')) {
    throw new Error('Email notifications require verified server configuration');
  }
  if (autoTranslationEnabled) {
    throw new Error('Automatic translation requires an approved provider and budget');
  }
  if (analyticsEnabled && !environment.POSTHOG_PROJECT_KEY) {
    throw new Error('Analytics require verified server configuration and per-device consent');
  }
  return Object.freeze({ emailNotificationsEnabled, autoTranslationEnabled, analyticsEnabled });
}

// Invoke providers lazily: disabled features must never import or call an SDK.
export async function runOptionalAdapter<T>(enabled: boolean, operation: () => Promise<T> | T) {
  if (!enabled) return { status: 'disabled' as const };
  return { status: 'completed' as const, value: await operation() };
}
