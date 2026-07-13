import { useEffect, useState } from 'react';
export default function Timer({ startTime, durationMinutes, onExpire }: { startTime: Date, durationMinutes: number, onExpire: () => void }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    // Calculate end time based on the server's startTime plus duration
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    
    const calculateTimeLeft = () => {
      const now = new Date();
      const difference = endTime.getTime() - now.getTime();
      return Math.max(0, Math.floor(difference / 1000));
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime, durationMinutes, onExpire]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isWarning = timeLeft < 300; // Less than 5 minutes

  return (
    <div className={`font-mono text-xl font-bold px-4 py-2 rounded-lg border ${isWarning ? 'bg-red-500/10 border-red-500/50 text-red-400 animate-pulse' : 'bg-slate-800/50 border-slate-700 text-primary'}`}>
      {formatTime(timeLeft)}
    </div>
  );
}
