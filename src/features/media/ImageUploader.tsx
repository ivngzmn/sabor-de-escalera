import { useId, useState } from 'react';
import { acceptedTypes, MAX_INPUT_BYTES, type AssetRef, type Purpose, type Result, type UploadIntent } from './contracts';
class UploadError extends Error { constructor(message: string, readonly status: number) { super(message); } }
interface Props { purpose: Purpose; available: boolean; spanish?: boolean; currentAssetId?: string | null; onComplete?: (asset: AssetRef) => void; }
export default function ImageUploader({ purpose, available, spanish = false, currentAssetId, onComplete }: Props) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [intent, setIntent] = useState<UploadIntent | null>(null);
  const [processed, setProcessed] = useState<AssetRef | null>(null);
  const [savedId, setSavedId] = useState(currentAssetId ?? null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const text = (en: string, es: string) => spanish ? es : en;
  async function post<T>(path: string, input: unknown): Promise<T> {
    const response = await fetch(`/api/media/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), credentials: 'same-origin', redirect: 'error' });
    const result: Result<T> = await response.json();
    if (!response.ok || !result.ok) {
      const minutes = !result.ok && result.error.retryAfter ? Math.max(1, Math.ceil(result.error.retryAfter / 60)) : null;
      const message = minutes ? text(`Upload limit reached. Retry in ${minutes} minutes.`, `Límite de fotos alcanzado. Inténtalo en ${minutes} minutos.`) : !result.ok ? (spanish ? 'No se pudo guardar la foto. Inténtalo de nuevo.' : result.error.message) : text('Please retry your photo.', 'Intenta subir la foto de nuevo.');
      throw new UploadError(message, response.status);
    }
    return result.value;
  }
  async function directUpload(upload: UploadIntent, photo: File) {
    if (upload.grant.endpoint !== 'https://upload.imagekit.io/api/v2/files/upload') throw new Error(text('Photo upload unavailable.', 'No se puede subir la foto.'));
    const form = new FormData();
    form.append('file', photo);
    for (const [key, value] of Object.entries(upload.grant.fields)) form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    form.append('token', upload.grant.token);
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', upload.grant.endpoint); xhr.timeout = 120000;
      xhr.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(text('Upload failed. Retry your photo.', 'Error al subir. Inténtalo de nuevo.')));
      xhr.onerror = xhr.ontimeout = () => reject(new Error(text('Connection interrupted. Retry your photo.', 'Se interrumpió la conexión. Inténtalo de nuevo.')));
      xhr.send(form);
    });
  }
  async function upload() {
    if (!file || !available || busy) return;
    setBusy(true); setError('');
    try {
      let pending = intent;
      let asset = processed;
      if (!pending) {
        setMessage(text('Preparing photo…', 'Preparando foto…'));
        pending = await post<UploadIntent>('intents', { purpose, mime: file.type, size: file.size });
        setMessage(text('Uploading photo…', 'Subiendo foto…')); setProgress(0);
        await directUpload(pending, file);
        // After successful transport, retry only server inspection/attachment.
        // Preserve the intent across lost completion acknowledgments.
        setIntent(pending);
      }
      if (!asset) {
        setMessage(text('Processing photo…', 'Procesando foto…'));
        asset = await post<AssetRef>('complete', { intentId: pending.id });
        setProcessed(asset);
      }
      if (purpose === 'avatar') await post('avatar', { assetId: asset.id });
      setSavedId(asset.id); onComplete?.(asset);
      setMessage(text('Photo saved.', 'Foto guardada.')); setFile(null); setIntent(null); setProcessed(null);
    } catch (failure) { if (failure instanceof UploadError && failure.status === 409) { setIntent(null); setProcessed(null); } setMessage(''); setError(failure instanceof Error ? failure.message : text('Please retry your photo.', 'Intenta subir la foto de nuevo.')); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { await post('avatar', { assetId: null }); setSavedId(null); setMessage(text('Photo removed. Your selected avatar will be used.', 'Foto eliminada. Se usará el avatar seleccionado.')); }
    catch { setError(text('Could not remove the photo. Please retry.', 'No se pudo eliminar la foto. Inténtalo de nuevo.')); }
    finally { setBusy(false); }
  }
  return <fieldset aria-describedby={`${id}-hint`}>
    <legend>{text(purpose === 'avatar' ? 'Profile photo (optional)' : 'Photo', purpose === 'avatar' ? 'Foto de perfil (opcional)' : 'Foto')}</legend>
    <p id={`${id}-hint`}>{available ? text('JPEG, PNG or WebP, up to 20 MB. Your current photo stays until the replacement is saved.', 'JPEG, PNG o WebP, hasta 20 MB. Tu foto actual se conserva hasta guardar la nueva.') : text('Photo uploads are temporarily unavailable. You can use your initials or a preset avatar.', 'No se pueden subir fotos por ahora. Puedes usar tus iniciales o un avatar.')}</p>
    {savedId && <img src={`/api/media/${encodeURIComponent(savedId)}?variant=${purpose === 'avatar' ? 'avatar' : 'card'}`} width={purpose === 'avatar' ? 256 : 640} height={purpose === 'avatar' ? 256 : 480} alt={text('Your saved photo', 'Tu foto guardada')} />}
    <label htmlFor={`${id}-file`}>{text('Choose photo', 'Elegir foto')}</label>
    <input id={`${id}-file`} type="file" accept={acceptedTypes.join(',')} disabled={!available || busy} aria-describedby={`${id}-hint`} aria-invalid={!!error} onChange={(event) => {
      const selected = event.currentTarget.files?.[0]; setIntent(null); setProcessed(null); setMessage(''); setError('');
      if (!selected) { setFile(null); return; }
      if (!acceptedTypes.includes(selected.type) || selected.size < 1 || selected.size > MAX_INPUT_BYTES) { setFile(null); setError(text('Choose a JPEG, PNG or WebP photo up to 20 MB.', 'Elige una foto JPEG, PNG o WebP de hasta 20 MB.')); return; }
      setFile(selected);
    }} />
    <button type="button" disabled={!available || !file || busy} onClick={upload}>{error && file ? text('Retry photo', 'Reintentar foto') : text('Upload photo', 'Subir foto')}</button>
    {purpose === 'avatar' && savedId && <button type="button" disabled={!available || busy} onClick={remove}>{text('Remove photo', 'Eliminar foto')}</button>}
    {busy && <progress value={progress} max="100" aria-label={text('Photo upload progress', 'Progreso de la foto')} />}
    <p role="status" aria-live="polite">{message}</p>
    {error && <p role="alert"><a href={`#${id}-file`}>{error}</a></p>}
  </fieldset>;
}
