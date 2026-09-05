'use client';

// Progress over time.
//
// This is the honest half of Parrot. An absolute level from ninety seconds of
// speech is a guess; the same speaker's dead air falling across six recordings
// is a measurement, computed identically each time with the speaker as their
// own control.
//
// Charting notes: three metrics of different scales are three separate
// single-series charts, never one plot with two axes. With a handful of points
// a fitted trend line would imply precision the data has not got, so each tile
// states first-to-latest change and the sparkline shows the actual shape.
// Direction is carried by an arrow and a word as well as colour.

import type { Session, Trend } from '@/lib/history';
import { trends } from '@/lib/history';

export function History({ sessions, unitLabel }: { sessions: Session[]; unitLabel: string }) {
  if (sessions.length < 2) {
    return (
      <p className="lede" style={{ marginBottom: 0 }}>
        {sessions.length === 1
          ? 'This is the first recording Parrot has seen in this language. Record another and this section starts comparing them — which is the only measurement here that does not depend on a model’s judgement.'
          : 'Once you have analysed two recordings in the same language, this section tracks the change between them.'}
      </p>
    );
  }

  const t = trends(sessions);
  return (
    <>
      <div className="trends">
        {t.map((tr) => (
          <TrendTile key={tr.metric} trend={tr} sessions={sessions} />
        ))}
      </div>
      <SessionTable sessions={sessions} unitLabel={unitLabel} />
    </>
  );
}

function TrendTile({ trend, sessions }: { trend: Trend; sessions: Session[] }) {
  const values = sessions.map((s) => s[trend.metric]);
  const improved = trend.lowerIsBetter ? trend.delta < 0 : trend.delta > 0;
  const flat = Math.abs(trend.delta) < 0.05;
  const tone = flat ? 'flat' : improved ? 'good' : 'bad';
  const word = flat ? 'unchanged' : improved ? 'better' : 'worse';
  const arrow = flat ? '→' : trend.delta < 0 ? '↓' : '↑';

  return (
    <div className="trend">
      <span className="sk">{trend.label}</span>
      <div className="trendrow">
        <span className="sv">
          {trend.latest}
          {trend.unit ? <small>{trend.unit}</small> : null}
        </span>
        <span className={`delta ${tone}`}>
          <span aria-hidden="true">{arrow}</span>
          {flat ? '' : ` ${Math.abs(trend.delta)}${trend.unit}`} {word}
        </span>
      </div>
      <Spark values={values} lowerIsBetter={trend.lowerIsBetter} sessions={sessions} />
      <span className="sn">
        {trend.first}{trend.unit} on the first recording · {sessions.length} sessions
      </span>
    </div>
  );
}

/**
 * Sparkline. One series, so no legend — the tile title names it. The endpoint
 * is emphasised because "where you are now" is the thing being read.
 */
function Spark({
  values, sessions,
}: { values: number[]; lowerIsBetter: boolean; sessions: Session[] }) {
  const W = 220, H = 44, PAD = 5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const flat = max === min;
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / Math.max(1, values.length - 1)) * (W - PAD * 2);
  // An unchanged metric has no shape. Pinning it to the baseline would read as
  // "zero" rather than "steady", so a flat series sits mid-height instead.
  const y = (v: number) => (flat ? H / 2 : H - PAD - ((v - min) / span) * (H - PAD * 2));
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img"
         aria-label={`Trend across ${values.length} sessions: ${values.join(', ')}`}>
      <line className="sparkbase" x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} />
      <path className="sparkline" d={d} />
      {values.map((v, i) => (
        <circle
          key={i}
          className={i === values.length - 1 ? 'sparkdot last' : 'sparkdot'}
          cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 4 : 2.5}
        >
          <title>{`${new Date(sessions[i].at).toLocaleDateString()} · ${v}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function SessionTable({ sessions, unitLabel }: { sessions: Session[]; unitLabel: string }) {
  const rows = [...sessions].reverse();
  return (
    <div className="tablewrap">
      <table className="sessions">
        <caption>Every recording Parrot has analysed in this language, newest first.</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Recording</th>
            <th scope="col">Words</th>
            <th scope="col">Articulation</th>
            <th scope="col">Dead air</th>
            <th scope="col">Mistakes / 100</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>{new Date(s.at).toLocaleDateString()}</td>
              <td className="fname" title={s.filename}>{s.filename}</td>
              <td>{s.words}</td>
              <td>{s.articulationRate}</td>
              <td>{s.deadAirPercent}%</td>
              <td>{s.errorsPer100}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tablenote">{unitLabel} · measured locally, never sent anywhere.</p>
    </div>
  );
}
