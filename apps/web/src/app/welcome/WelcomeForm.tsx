'use client';
import { useState } from 'react';
import { api, ApiError } from '@/client/api';
import { SETTING_LABELS } from '@/lib/constants';

export function WelcomeForm({ defaultName }: { defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [pgy, setPgy] = useState<'' | 1 | 2>('');
  const [setting, setSetting] = useState('any');
  const [img, setImg] = useState(false);
  const [agree, setAgree] = useState(false);
  const [supervisorView, setSupervisorView] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/me', { body: { name, pgyLevel: pgy === '' ? null : pgy, settingPreference: setting, img, agree, supervisorView } });
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Try again.');
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label className="field" htmlFor="name">Your name
        <input id="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, marginBottom: 6 }}>Your year <small className="muted" style={{ fontWeight: 400 }}>Questions are pitched to it. You can change it later.</small></legend>
        <div className="chips" role="group" aria-label="Your year">
          {([1, 2] as const).map((n) => <button key={n} type="button" className="chip" aria-pressed={pgy === n} onClick={() => setPgy(n)}>PGY{n}</button>)}
          <button type="button" className="chip" aria-pressed={pgy === ''} onClick={() => setPgy('')}>Other</button>
        </div>
      </fieldset>
      <label className="field" htmlFor="setting">Where you mostly work <small>Shapes which cases you see first.</small>
        <select id="setting" value={setting} onChange={(e) => setSetting(e.target.value)}>
          {Object.entries(SETTING_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="check" htmlFor="img">
        <input id="img" type="checkbox" checked={img} onChange={(e) => setImg(e.target.checked)} />
        <span>I trained overseas (international medical graduate pathway). Optional; it helps us pick content that explains the Australian system.</span>
      </label>
      <label className="check" htmlFor="supervisor">
        <input id="supervisor" type="checkbox" checked={supervisorView} onChange={(e) => setSupervisorView(e.target.checked)} />
        <span>Let my supervisor see a summary of my progress (not my individual answers or reflections). You can change this later.</span>
      </label>
      <label className="check" htmlFor="agree">
        <input id="agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
        <span>I understand how my data is used and agree to take part in the beta.</span>
      </label>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <button className="btn" type="submit" disabled={busy || !agree || !name.trim()}>{busy ? 'Saving…' : 'Start practising'}</button>
    </form>
  );
}
