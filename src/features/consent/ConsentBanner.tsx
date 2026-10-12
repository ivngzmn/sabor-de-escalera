import { useEffect, useRef, useState } from 'react';
import { CONSENT_STORAGE_KEY, readConsent, subscribeConsent, synchronizeConsent, updateConsent, type ConsentChoices } from './service';
const dictionaries = {
  en: {
    title: 'Your privacy choices', intro: 'Essential services keep sign-in, security and your saved account drafts working. Optional choices start off and can be changed at any time in Privacy settings.',
    accept: 'Accept optional', reject: 'Reject optional', customize: 'Customize', save: 'Save privacy choices', saved: 'Privacy choices saved.', essential: 'Essential — always active',
    preferences: 'Remember preferences', preferencesPurpose: 'Remember your language and display choices on this device.',
    recovery: 'Local draft recovery', recoveryPurpose: 'Keep a text recovery copy on this device. Account autosave works without this choice.',
    analytics: 'Usage analytics', analyticsPurpose: 'Help us understand aggregate use without recipe text or personal profiles. Analytics remain unavailable until privacy controls are verified.',
  },
  es: {
    title: 'Tus opciones de privacidad', intro: 'Los servicios esenciales permiten iniciar sesión, mantener la seguridad y guardar tus borradores en la cuenta. Las opciones empiezan desactivadas y se pueden cambiar en Configuración de privacidad.',
    accept: 'Aceptar opcionales', reject: 'Rechazar opcionales', customize: 'Personalizar', save: 'Guardar opciones de privacidad', saved: 'Opciones de privacidad guardadas.', essential: 'Esenciales — siempre activos',
    preferences: 'Recordar preferencias', preferencesPurpose: 'Recordar tu idioma y tus opciones de visualización en este dispositivo.',
    recovery: 'Recuperación local de borradores', recoveryPurpose: 'Guardar una copia de recuperación de texto en este dispositivo. El guardado en la cuenta funciona sin esta opción.',
    analytics: 'Analíticas de uso', analyticsPurpose: 'Ayudarnos a entender el uso agregado sin texto de recetas ni perfiles personales. Las analíticas seguirán desactivadas hasta verificar los controles de privacidad.',
  },
};
export default function ConsentBanner({ language = 'en', settings = false }: { language?: 'en' | 'es'; settings?: boolean }) {
  const copy = dictionaries[language];
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [customize, setCustomize] = useState(settings);
  const [choices, setChoices] = useState<ConsentChoices>({ preferences: false, recovery: false, analytics: false });
  const [message, setMessage] = useState('');
  const fieldset = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const refresh = () => { const consent = readConsent(); setChoices(consent); setVisible(settings || !consent.updatedAt); };
    refresh(); synchronizeConsent(); setReady(true);
    const unsubscribe = subscribeConsent(refresh);
    const sync = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === CONSENT_STORAGE_KEY || event.key === null)) synchronizeConsent();
    };
    window.addEventListener('storage', sync);
    return () => { unsubscribe(); window.removeEventListener('storage', sync); };
  }, [settings]);
  useEffect(() => { if (customize && !settings) fieldset.current?.focus(); }, [customize, settings]);
  const save = (next: ConsentChoices) => { updateConsent(next); setMessage(copy.saved); };
  return <>
    <p role="status" className="consent-status">{message}</p>
    {visible && <section className={`consent-panel ${settings ? '' : 'consent-banner'}`} aria-label={copy.title}>
      {!settings && <h2>{copy.title}</h2>}
      <p>{copy.intro}</p>
      <div className="consent-actions">
        <button type="button" disabled={!ready} onClick={() => save({ preferences: true, recovery: true, analytics: true })}>{copy.accept}</button>
        <button type="button" disabled={!ready} onClick={() => save({ preferences: false, recovery: false, analytics: false })}>{copy.reject}</button>
        {!settings && <button type="button" disabled={!ready} onClick={() => setCustomize(true)}>{copy.customize}</button>}
      </div>
      {customize && <form onSubmit={(event) => { event.preventDefault(); save(choices); }}>
        <fieldset disabled={!ready} ref={fieldset} tabIndex={-1}>
          <legend>{copy.title}</legend>
          <p>{copy.essential}</p>
          {(['preferences', 'recovery', 'analytics'] as const).map((category) => <div key={category} className="consent-choice">
            <label><input type="checkbox" checked={choices[category]} onChange={(event) => setChoices({ ...choices, [category]: event.target.checked })} aria-describedby={`consent-${category}-purpose`} /> {copy[category]}</label>
            <p id={`consent-${category}-purpose`}>{copy[`${category}Purpose`]}</p>
          </div>)}
        </fieldset>
        <button type="submit" disabled={!ready}>{copy.save}</button>
      </form>}
    </section>}
  </>;
}
