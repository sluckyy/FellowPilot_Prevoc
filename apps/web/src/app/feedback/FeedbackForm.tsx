'use client';
import { useState } from 'react';
import { api, ApiError } from '@/client/api';

const AREAS = [
  { value: 'idea', label: 'An idea or feature request' },
  { value: 'problem', label: 'Something not working' },
  { value: 'questions', label: 'The questions in general' },
  { value: 'insights', label: 'Insights and statistics' },
  { value: 'design', label: 'Look and feel' },
  { value: 'other', label: 'Something else' },
];

export function FeedbackForm() {
  const [area, setArea] = useState('idea');
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending'); setError(null);
    try {
      await api('/api/feedback', { body: { area, body, screen: 'feedback' } });
      setState('sent'); setBody('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send. Try again.');
      setState('idle');
    }
  }
  return (
    <form className="stack" onSubmit={submit}>
      <label className="field" htmlFor="fb-area">About
        <select id="fb-area" value={area} onChange={(e) => setArea(e.target.value)}>
          {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </label>
      <label className="field" htmlFor="fb-body">Your feedback
        <textarea id="fb-body" value={body} onChange={(e) => { setBody(e.target.value); if (state === 'sent') setState('idle'); }} maxLength={5000} required />
      </label>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {state === 'sent' ? <p className="notice info" role="status">Sent. Thank you.</p> : null}
      <button className="btn" type="submit" disabled={state === 'sending' || body.trim().length < 3}>{state === 'sending' ? 'Sending…' : 'Send feedback'}</button>
    </form>
  );
}
