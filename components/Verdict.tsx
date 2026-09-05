import { rich } from '@/lib/text';
import type { Drill, Level } from '@/lib/schema';
import { MIN_WORDS_FOR_LEVEL } from '@/lib/types';

export function Verdict({
  level, paragraphs, reliable, wordCount,
}: { level: Level; paragraphs: string[]; reliable: boolean; wordCount: number }) {
  return (
    <div className="verdict">
      {reliable ? (
        <div className="levels">
          <span className="lvl on">{level.band}</span>
          {level.reaching ? <span className="lvl next">{level.reaching}</span> : null}
          <span className="lvl framework">{level.framework} estimate</span>
        </div>
      ) : (
        <p className="levelwarn">
          <b>No level placed.</b> A {level.framework} band needs far more speech than
          this — {wordCount} words against a {MIN_WORDS_FOR_LEVEL}-word floor — and real
          placement uses a rubric, trained raters and several task types. Printing a badge
          off one short monologue would look more authoritative than it deserves, so
          Parrot declines. The notes below still stand on their own.
        </p>
      )}
      {paragraphs.map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={rich(p)} />
      ))}
    </div>
  );
}

export function Drills({ drills }: { drills: Drill[] }) {
  if (!drills.length) return null;
  return (
    <ol className="drills">
      {drills.map((d, i) => (
        <li key={i}>
          <div>
            <h3 dangerouslySetInnerHTML={rich(d.title)} />
            <p>
              {d.examples ? <span className="say">{d.examples}</span> : null}
              {d.examples ? ' — ' : null}
              <span dangerouslySetInnerHTML={rich(d.detail)} />
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
