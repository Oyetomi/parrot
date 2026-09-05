import { rich } from '@/lib/text';
import type { Drill, Level } from '@/lib/schema';

export function Verdict({ level, paragraphs }: { level: Level; paragraphs: string[] }) {
  return (
    <div className="verdict">
      <div className="levels">
        <span className="lvl on">{level.band}</span>
        {level.reaching ? <span className="lvl next">{level.reaching}</span> : null}
        <span className="lvl framework">{level.framework}</span>
      </div>
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
