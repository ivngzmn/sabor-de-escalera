// Server-only adapter. The src/server boundary rejects client bundling.
export { createEmailAdapter, renderEmail, sendEmail } from '../../server/email';
export type { EmailKind, EmailRecord, Result, SendStatus, SendStore } from '../../server/email';
