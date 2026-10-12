export type Purpose = 'recipe' | 'cooking' | 'avatar';
export type Variant = 'thumb' | 'card' | 'gallery' | 'avatar';
export interface AssetRef { id: string; width: number; height: number; }
export interface UploadGrant { endpoint: string; fields: Record<string, unknown>; token: string; }
export interface UploadIntent { id: string; path: string; expiresAt: number; grant: UploadGrant; }
export interface MediaFailure { status: number; message: string; retryAfter?: number; }
export type Result<T> = { ok: true; value: T } | { ok: false; error: MediaFailure };
export const MAX_INPUT_BYTES = 20000000;
export const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];
