'use client';

import { useEffect, useRef, useState } from 'react';
import * as Store from '@/lib/store';
import { providerById } from '@/lib/providers';

/**
 * `which` names the provider whose key is being edited, or null when closed.
 * Groq is always needed because it does the transcription; the analysis
 * provider is whichever one is selected.
 */
export function KeyDialog({ which, onClose }: { which: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [value, setValue] = useState('');
  const provider = providerById(which ?? 'groq');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (which && !d.open) { setValue(Store.getKey(which)); d.showModal(); }
    if (!which && d.open) d.close();
  }, [which]);

  return (
    <dialog className="dlg" ref={ref} onClose={onClose}>
      <form
        className="dlginner"
        method="dialog"
        onSubmit={(e) => {
          if (!which) return;
          const action = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          Store.setKey(which, action?.value === 'clear' ? '' : value.trim());
        }}
      >
        <h3>Your {provider.name} API key</h3>
        <p className="dlgnote">
          Parrot has no backend. Keys are stored in this browser&apos;s <code>localStorage</code>{' '}
          and sent straight to {provider.name} — they never touch a server of ours, because there
          isn&apos;t one.
        </p>

        {provider.trainsOnYourData ? (
          <p className="trainwarn">
            <b>{provider.name}&apos;s free tier trains on your data.</b> Using it means your
            transcripts may be used to improve their models. Everything else here keeps your
            recording on your machine; this is the one choice that does not.
          </p>
        ) : null}

        <label htmlFor="keyInput">API key</label>
        <input
          id="keyInput"
          type="password"
          placeholder="paste it here"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="dlgnote">
          Get one at{' '}
          <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer">
            {provider.keyUrl.replace(/^https:\/\//, '')}
          </a>
          . {provider.freeTierNote}
        </p>
        <div className="dlgrow">
          <button className="cta small" type="submit" value="save">Save key</button>
          <button className="ghost dark" type="submit" value="clear">Forget it</button>
        </div>
      </form>
    </dialog>
  );
}
