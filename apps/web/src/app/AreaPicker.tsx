'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AreaPicker({ areas }: { areas: { learning_area: string; n: number }[] }) {
  const [area, setArea] = useState('');
  const router = useRouter();
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); if (area) router.push(`/practice?size=10&area=${encodeURIComponent(area)}`); }}>
      <label className="sr-only" htmlFor="area">Learning area</label>
      <select id="area" value={area} onChange={(e) => setArea(e.target.value)} style={{ flex: '1 1 14rem' }}>
        <option value="">Practise one learning area…</option>
        {areas.map((a) => <option key={a.learning_area} value={a.learning_area}>{a.learning_area} ({a.n})</option>)}
      </select>
      <button className="btn quiet" type="submit" disabled={!area}>Start</button>
    </form>
  );
}
