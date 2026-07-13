import { useEffect, useState } from 'react';

interface TimerProps {
  startTime: Date;
  durationMinutes: number;
  onExpire: () => void;
}

// Timer func
export default function Timer({ startTime, durationMinutes, onExpire }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);
    const calc = () => Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000));

    setTimeLeft(calc());

    const id = setInterval(() => {
      const rem = calc();
      setTimeLeft(rem);
      if (rem <= 0) { clearInterval(id); onExpire(); }
    }, 1000);

    return () => clearInterval(id);
  }, [startTime, durationMinutes, onExpire]);

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const ss = String(timeLeft % 60).padStart(2, '0');

  const total = durationMinutes * 60;
  const pct = total > 0 ? timeLeft / total : 0;
  const isDanger = timeLeft <= 30;
  const isWarn   = timeLeft <= 60 && !isDanger;

  const color = isDanger ? 'var(--accent-red)' : isWarn ? 'var(--accent-orange)' : 'var(--text-secondary)';
  const r = 14;
  const circ = 2 * Math.PI * r;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* SVG ring */}
      <svg width={36} height={36} viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--border-default)" strokeWidth="2.5" />
        <circle
          cx="18" cy="18" r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.4s ease' }}
        />
      </svg>

      {/* Numeric */}
      <div>
        <div
          className="font-mono"
          style={{
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1,
            color,
            letterSpacing: '0.02em',
            transition: 'color 0.4s ease',
          }}
        >
          {mm}:{ss}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>remaining</div>
      </div>
    </div>
  );
}
