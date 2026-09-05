'use client';

import { useEffect, useRef, useState } from 'react';
import * as Store from '@/lib/store';

export function KeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setValue(Store.getKey()); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog className="dlg" ref={ref} onClose={onClose}>
      <form
        className="dlginner"
        method="dialog"
        onSubmit={(e) => {
          const action = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          Store.setKey(action?.value === 'clear' ? '' : value.trim());
        }}
      >
        <h3>Your Groq API key</h3>
        <p className="dlgnote">
          Parrot has no backend. Your key is stored in this browser&apos;s <code>localStorage</code>{' '}
          and sent straight from this page to Groq — it never touches a server of ours, because
          there isn&apos;t one.
        </p>
        <label htmlFor="keyInput">API key</label>
        <input
          id="keyInput"
          type="password"
          placeholder="gsk_…"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="dlgnote">
          Get a free one at{' '}
          <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
            console.groq.com/keys
          </a>
          . The free tier covers about 8 hours of audio a day.
        </p>
        <div className="dlgrow">
          <button className="cta small" type="submit" value="save">Save key</button>
          <button className="ghost dark" type="submit" value="clear">Forget it</button>
        </div>
      </form>
    </dialog>
  );
}
