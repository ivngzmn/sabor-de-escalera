import { createHmac } from 'node:crypto';
import type { UploadGrant, Variant } from '../features/media/contracts';
import { MAX_STORED_BYTES, variants } from './media-policy';
export interface ProviderFile { fileId: string; filePath: string; isPrivateFile: boolean; size: number; bytes: Buffer; }
export interface MediaProvider {
  grant(fields: Record<string, unknown>, expiresAt: number): Promise<UploadGrant>;
  inspect(path: string): Promise<ProviderFile | null>;
  derivative(path: string, variant: Variant): Promise<Buffer>;
  removeAndPurge(fileId: string, path: string, purgeId?: string): Promise<{ complete: boolean; purgeId: string }>;
}
interface Config { publicKey: string; privateKey: string; urlEndpoint: string; fetcher?: typeof fetch; }
export function createImageKitProvider({ publicKey, privateKey, urlEndpoint, fetcher = fetch }: Config): MediaProvider {
  const endpoint = new URL(urlEndpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid media endpoint');
  const base = endpoint.href.replace(/\/$/, '');
  const authorization = `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}`;
  async function api(path: string, init: RequestInit = {}) {
    const response = await fetcher(`https://api.imagekit.io/v1/${path}`, { ...init, headers: { Authorization: authorization, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok && !(init.method === 'DELETE' && response.status === 404)) throw new Error('Media provider unavailable');
    return response;
  }
  function signed(path: string, transformation?: string) {
    if (!/^\/private\/[a-zA-Z0-9/-]+\.webp$/.test(path) && !/^\/private\/[a-zA-Z0-9-]+\.webp$/.test(path)) throw new Error('Invalid private path');
    const relative = `${transformation ? `tr:${transformation}/` : ''}${path.slice(1)}`;
    const expiry = Math.floor(Date.now() / 1000) + 60;
    const signature = createHmac('sha1', privateKey).update(`${relative}${expiry}`).digest('hex');
    return `${base}/${relative}?ik-t=${expiry}&ik-s=${signature}`;
  }
  async function download(url: string) {
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok || !response.body || Number(response.headers.get('Content-Length')) > MAX_STORED_BYTES) { await response.body?.cancel(); throw new Error('Invalid image response'); }
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.length;
        if (size > MAX_STORED_BYTES) throw new Error('Image exceeds stored limit');
        chunks.push(next.value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    return Buffer.concat(chunks);
  }
  return {
    async grant(fields, expiresAt) {
      const now = Math.floor(Date.now() / 1000);
      // V2 compares claims with multipart strings, not their JS source types.
      // Empty collections are rejected by ImageKit; absent fields remain bound
      // by V2's rejection of additional, unsigned request parameters.
      const wireFields = Object.fromEntries(Object.entries(fields)
        .filter(([, value]) => !Array.isArray(value) || value.length > 0)
        .map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)]));
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: publicKey })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ ...wireFields, iat: now, exp: Math.min(now + 300, Math.floor(expiresAt / 1000)) })).toString('base64url');
      const signature = createHmac('sha256', privateKey).update(`${header}.${payload}`).digest('base64url');
      return { endpoint: 'https://upload.imagekit.io/api/v2/files/upload', fields: wireFields, token: `${header}.${payload}.${signature}` };
    },
    async inspect(path) {
      const query = new URLSearchParams({ path: path.slice(0, path.lastIndexOf('/')), limit: '2', type: 'file' });
      const files: unknown = await (await api(`files?${query}`)).json();
      if (!Array.isArray(files) || files.length !== 1) return null;
      const file = files[0];
      if (file.filePath !== path || file.isPrivateFile !== true || typeof file.fileId !== 'string' || !Number.isInteger(file.size) || file.size > MAX_STORED_BYTES) return null;
      // Inspect the retained library object, not a transformed delivery URL.
      return { fileId: file.fileId, filePath: file.filePath, isPrivateFile: true, size: file.size, bytes: await download(signed(path, 'orig-true')) };
    },
    async derivative(path, variant) { return download(signed(path, variants[variant])); },
    async removeAndPurge(fileId, path, purgeId) {
      await api(`files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
      if (!purgeId) {
        const requested = await (await api('files/purge', { method: 'POST', body: JSON.stringify({ url: `${base}${path}` }) })).json();
        if (typeof requested.requestId !== 'string') throw new Error('Purge request unavailable');
        // Persist this ID before polling on the next reconciliation invocation.
        return { complete: false, purgeId: requested.requestId };
      }
      const status = await (await api(`files/purge/${encodeURIComponent(purgeId)}`)).json();
      return { complete: status.status === 'Completed', purgeId };
    },
  };
}
export function imageKitProvider(): MediaProvider {
  return createImageKitProvider({ publicKey: process.env.IMAGEKIT_PUBLIC_KEY ?? '', privateKey: process.env.IMAGEKIT_PRIVATE_KEY ?? '', urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT ?? 'https://ik.imagekit.io/unconfigured' });
}
