import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { LocalStorage } from '../lib/storage';
import Timer from '../components/Timer';
import ThemeToggle from '../components/ThemeToggle';
import type { Question } from '../data/questionBank';

/* ── Type badge ── */
const typeMeta: Record<string, { label: string; color: string }> = {
  mcq:         { label: 'Single Choice', color: 'var(--accent-blue)' },
  multiselect: { label: 'Multi-select',  color: 'var(--accent)' },
  truefalse:   { label: 'True / False',  color: 'var(--accent-orange)' },
};

/* ── Confirmation modal ── */
function SubmitModal({
  answeredCount, total, onCancel, onConfirm
}: { answeredCount: number; total: number; onCancel: () => void; onConfirm: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          backgroundColor: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
      >
        <motion.div
          key="modal"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className="glass"
          style={{ width: '100%', maxWidth: 400, padding: '24px 28px' }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>
            Submit assessment?
          </h3>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
            You have answered <strong>{answeredCount}</strong> of <strong>{total}</strong> questions.
          </p>
          {answeredCount < total && (
            <p style={{ fontSize: 13, color: 'var(--accent-orange)', marginBottom: 4 }}>
              {total - answeredCount} question{total - answeredCount > 1 ? 's are' : ' is'} unanswered and will be left blank.
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={onCancel} className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>
              Go Back
            </button>
            <button onClick={onConfirm} className="btn btn-accent" style={{ flex: 1, justifyContent: 'center' }}>
              Submit
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Main component ── */
export default function Assessment() {
  const { testId } = useParams();
  const navigate = useNavigate();

  const [questions, setQuestions]     = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers]         = useState<Record<string, string | string[]>>({});
  const [isOffline, setIsOffline]     = useState(!navigator.onLine);
  const [loading, setLoading]         = useState(true);
  const [attemptData, setAttemptData] = useState<any>(null);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'pending' | 'submitted'>('idle');
  const [showModal, setShowModal]     = useState(false);

  /* online/offline */
  useEffect(() => {
    const on  = async () => { 
      setIsOffline(false); 
      toast.success('Connection restored. Syncing your answers…'); 
      
      const pending = await LocalStorage.getItem('pending_offline_submission');
      if (pending && auth.currentUser && testId) {
        try {
          // We MUST wait for this promise. It forces React to wait until Firebase has successfully
          // flushed its offline queue to the server. Without this, we navigate to the Lobby too quickly,
          // and the Lobby fetches the old 'in-progress' state from the server.
          const ref = doc(db, 'attempts', `${auth.currentUser.uid}_${testId}`);
          await updateDoc(ref, { status: 'submitted', submittedAt: new Date() });
          
          setSubmitStatus('submitted');
          await LocalStorage.clear();
          toast.success('Assessment successfully synced and submitted!');
          navigate(`/oa/${testId}`);
        } catch {
          await LocalStorage.clear();
          navigate(`/oa/${testId}`);
        }
      }
    };
    const off = () => { setIsOffline(true);  toast.warning('No internet connection. Answers are saved locally.'); };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [navigate, testId]);

  /* load attempt */
  useEffect(() => {
    const init = async () => {
      if (!auth.currentUser || !testId) return navigate('/login');
      const ref = doc(db, 'attempts', `${auth.currentUser.uid}_${testId}`);
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data.status === 'submitted') { navigate(`/oa/${testId}`); return; }
          setAttemptData(data);
          
          // Save start time and duration so if they refresh offline, the timer continues from the correct time
          if (data.startTime) {
            LocalStorage.setItem('attempt_start_time', data.startTime.toDate().getTime());
            LocalStorage.setItem('attempt_duration', data.durationMinutes);
          }

          const localA = (await LocalStorage.getItem('answers')) as Record<string, string | string[]> || {};
          setAnswers({ ...(data.answers as Record<string, string | string[]>), ...localA });
          const cachedQ = await LocalStorage.getItem('current_questions');
          if (cachedQ) setQuestions(cachedQ as Question[]);
          const savedIdx = await LocalStorage.getItem('current_index');
          if (savedIdx !== null) setCurrentIndex(savedIdx as number);
        }
      } catch {
        const cachedQ  = await LocalStorage.getItem('current_questions');
        const localA   = await LocalStorage.getItem('answers') || {};
        const savedIdx = await LocalStorage.getItem('current_index');
        const savedStartTime = await LocalStorage.getItem('attempt_start_time') as number | null;
        const savedDuration = await LocalStorage.getItem('attempt_duration') as number | null;

        if (cachedQ) {
          setQuestions(cachedQ as Question[]);
          setAnswers(localA as Record<string, string | string[]>);
          if (savedIdx !== null) setCurrentIndex(savedIdx as number);
          
          // Use the real start time if available, otherwise fallback to now (though this shouldn't happen for a loaded test)
          setAttemptData({ 
            startTime: savedStartTime ? { toDate: () => new Date(savedStartTime) } : { toDate: () => new Date() }, 
            durationMinutes: savedDuration || 2 
          });
        }
      } finally {
        const pending = await LocalStorage.getItem('pending_offline_submission');
        if (pending) setSubmitStatus('pending');
        setLoading(false);
      }
    };
    init();
  }, [testId, navigate]);

  /* persist index */
  useEffect(() => { LocalStorage.setItem('current_index', currentIndex); }, [currentIndex]);

  /* anti-cheat */
  useEffect(() => {
    const onVisibility = async () => {
      if (document.hidden && auth.currentUser && testId) {
        const ref = doc(db, 'attempts', `${auth.currentUser.uid}_${testId}`);
        try {
          const snap = await getDoc(ref);
          if (snap.exists()) await updateDoc(ref, { tabViolations: (snap.data().tabViolations || 0) + 1 });
        } catch { /* offline */ }
        toast.error('Tab switch detected. This violation has been recorded.', { duration: 6000 });
      }
    };
    const noCopy = (e: ClipboardEvent) => e.preventDefault();
    const noMenu = (e: MouseEvent)     => e.preventDefault();
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('copy', noCopy);
    document.addEventListener('contextmenu', noMenu);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('copy', noCopy);
      document.removeEventListener('contextmenu', noMenu);
    };
  }, [testId]);



  /* answer handler */
  const handleAnswer = (qId: string, opt: string, isMulti: boolean, clear = false) => {
    if (submitStatus !== 'idle') return;
    
    setAnswers(prev => {
      const cur = prev[qId];
      let next: string | string[];
      if (clear)       next = isMulti ? [] : '';
      else if (isMulti) {
        const arr = Array.isArray(cur) ? cur : [];
        next = arr.includes(opt) ? arr.filter(o => o !== opt) : [...arr, opt];
      } else next = opt;

      const updated = { ...prev, [qId]: next };
      LocalStorage.setItem('answers', updated);
      if (auth.currentUser && testId) {
        const ref = doc(db, 'attempts', `${auth.currentUser.uid}_${testId}`);
        updateDoc(ref, { answers: updated }).catch(() => {});
      }
      return updated;
    });
  };

  /* submit */
  const handleFinalSubmit = async () => {
    if (!auth.currentUser || !testId) return;
    setSubmitStatus('pending');
    setShowModal(false);

    try {
      const ref = doc(db, 'attempts', `${auth.currentUser.uid}_${testId}`);
      if (isOffline) {
        LocalStorage.setItem('pending_offline_submission', true);
        toast.info('You are offline. The test is locked and will submit automatically once your connection is restored.', { duration: 10000 });
      }
      
      await updateDoc(ref, { status: 'submitted', submittedAt: new Date() });
      setSubmitStatus('submitted');
      await LocalStorage.clear();
      toast.success('Assessment submitted successfully!');
      navigate(`/oa/${testId}`);
    } catch {
      toast.error('Submission failed. Check your connection or contact support.');
    }
  };

  const answeredCount = Object.values(answers).filter(a => Array.isArray(a) ? a.length > 0 : !!a).length;

  if (loading || (attemptData && attemptData.status === 'submitted')) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-base)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {attemptData?.status === 'submitted' ? 'Redirecting to Lobby…' : 'Loading assessment…'}
        </span>
      </div>
    </div>
  );

  if (!questions.length) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-base)' }}>
      <p style={{ color: 'var(--text-secondary)' }}>No questions found for this assessment.</p>
    </div>
  );

  const q      = questions[currentIndex];
  const curAns = answers[q.id];
  const isMulti = q.type === 'multiselect';
  const meta    = typeMeta[q.type] ?? typeMeta.mcq;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-base)', userSelect: 'none' }}>

      {/* ── Mobile top bar (replaces sidebar on small screens) ── */}
      <div className="assessment-mobile-bar" style={{
        padding: '10px 16px',
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-default)',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        rowGap: 8,
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Progress:</span>
        <div style={{ flex: 1, height: 4, borderRadius: 99, backgroundColor: 'var(--border-default)', minWidth: 80, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(answeredCount / questions.length) * 100}%`, backgroundColor: 'var(--accent)', borderRadius: 99, transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{answeredCount}/{questions.length} answered</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {questions.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => setCurrentIndex(idx)}
              style={{
                width: 28, height: 28, borderRadius: 4, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                backgroundColor: idx === currentIndex ? 'var(--accent)' : (answers[item.id] && (Array.isArray(answers[item.id]) ? (answers[item.id] as string[]).length > 0 : !!answers[item.id])) ? 'var(--accent-subtle)' : 'var(--border-subtle)',
                color: idx === currentIndex ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.12s',
              }}
            >{idx + 1}</button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '7px 16px',
              backgroundColor: 'var(--accent-red-subtle)',
              borderBottom: '1px solid rgba(248,81,73,0.2)',
              fontSize: 13, fontWeight: 500, color: 'var(--accent-red)',
              overflow: 'hidden',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
            </svg>
            No internet — answers are saved locally and will sync automatically.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="glass-panel" style={{
        height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
        backgroundColor: 'var(--glass-bg)',
        borderBottom: '1px solid var(--border-default)',
        position: 'sticky', top: 0, zIndex: 40, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>
            Hack<span style={{ color: 'var(--accent)' }}>Off</span>
          </span>
          <div style={{ width: 1, height: 18, backgroundColor: 'var(--border-default)' }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
            Software Engineering Assessment
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {attemptData?.startTime && (
            <Timer
              startTime={attemptData.startTime.toDate ? attemptData.startTime.toDate() : new Date()}
              durationMinutes={attemptData.durationMinutes || 2}
              onExpire={handleFinalSubmit}
            />
          )}
          <ThemeToggle />
          <button
            onClick={() => setShowModal(true)}
            disabled={submitStatus !== 'idle'}
            className="btn btn-accent"
            style={{ padding: '7px 18px', fontSize: 13 }}
          >
            {submitStatus === 'pending' ? 'Submitting…' : submitStatus === 'submitted' ? 'Submitted' : 'Submit Test'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Sidebar */}
        <aside style={{
          width: 200,
          flexShrink: 0,
          borderRight: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-surface)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Progress */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Progress</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{answeredCount}/{questions.length}</span>
            </div>
            <div style={{ height: 3, borderRadius: 99, backgroundColor: 'var(--border-default)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(answeredCount / questions.length) * 100}%`,
                backgroundColor: 'var(--accent)',
                borderRadius: 99,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>

          {/* Question list */}
          <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
            {questions.map((item, idx) => {
              const answered = item.id in answers && (Array.isArray(answers[item.id]) ? (answers[item.id] as string[]).length > 0 : !!answers[item.id]);
              const active = idx === currentIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentIndex(idx)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    marginBottom: 2,
                    backgroundColor: active ? 'var(--accent-blue-subtle)' : 'transparent',
                    color: active ? 'var(--accent-blue)' : answered ? 'var(--accent)' : 'var(--text-secondary)',
                    textAlign: 'left',
                    transition: 'background-color 0.12s, color 0.12s',
                    fontFamily: 'inherit',
                  }}
                  onMouseOver={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--border-subtle)'; }}
                  onMouseOut={e =>  { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                    backgroundColor: active
                      ? 'var(--accent-blue)'
                      : answered
                      ? 'var(--accent-subtle)'
                      : 'var(--border-subtle)',
                    color: active ? '#fff' : answered ? 'var(--accent)' : 'var(--text-muted)',
                  }}>
                    {answered && !active
                      ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M2 6l3 3 5-5"/></svg>
                      : idx + 1}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: active ? 600 : 400 }}>Q{idx + 1}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Question pane */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="question-content"
            >
              {/* Question header */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                    Question {currentIndex + 1} of {questions.length}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: meta.color,
                    padding: '2px 8px', borderRadius: 99,
                    backgroundColor: 'color-mix(in srgb, ' + meta.color + ' 12%, transparent)',
                    border: `1px solid color-mix(in srgb, ${meta.color} 25%, transparent)`,
                  }}>
                    {meta.label}
                  </span>
                </div>
                <h2 style={{
                  fontSize: 17,
                  fontWeight: 600,
                  lineHeight: 1.55,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                }}>
                  {q.text}
                </h2>
                {isMulti && (
                  <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Select all that apply.
                  </p>
                )}
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {q.options.map((opt, i) => {
                  const sel = isMulti
                    ? Array.isArray(curAns) && curAns.includes(opt)
                    : curAns === opt;
                  return (
                    <motion.label
                      key={i}
                      whileHover={{ x: 2 }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '16px 20px',
                        borderRadius: 12, /* highly rounded */
                        cursor: submitStatus !== 'idle' ? 'not-allowed' : 'pointer',
                        opacity: submitStatus !== 'idle' ? 0.7 : 1,
                        border: sel
                          ? '2px solid var(--text-primary)'
                          : '1px solid var(--border-default)',
                        backgroundColor: sel
                          ? 'var(--accent-subtle)'
                          : 'var(--bg-surface)',
                        transition: 'border-color 0.15s, background-color 0.15s',
                      }}
                    >
                      {/* Indicator */}
                      <div style={{
                        width: 20, height: 20, flexShrink: 0,
                        borderRadius: isMulti ? 4 : 99,
                        border: sel ? '2px solid var(--text-primary)' : '1px solid var(--border-strong)',
                        backgroundColor: sel ? 'var(--text-primary)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}>
                        {sel && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--bg-base)" strokeWidth="2.5" strokeLinecap="round">
                            {isMulti ? <path d="M2 6l3 3 5-5"/> : <circle cx="6" cy="6" r="2.5" fill="var(--bg-base)" stroke="none"/>}
                          </svg>
                        )}
                      </div>

                      {/* Letter */}
                      <span style={{
                        width: 26, height: 26, borderRadius: 99,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, fontSize: 12, fontWeight: 700,
                        backgroundColor: sel ? 'var(--text-primary)' : 'var(--bg-overlay)',
                        color: sel ? 'var(--bg-base)' : 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}>
                        {String.fromCharCode(65 + i)}
                      </span>

                      <span style={{
                        fontSize: 14, fontWeight: sel ? 500 : 400,
                        color: sel ? 'var(--text-primary)' : 'var(--text-secondary)',
                        transition: 'color 0.15s',
                      }}>
                        {opt}
                      </span>

                      <input
                        type={isMulti ? 'checkbox' : 'radio'}
                        name={`q-${q.id}`}
                        value={opt}
                        checked={sel}
                        disabled={submitStatus !== 'idle'}
                        onChange={() => handleAnswer(q.id, opt, isMulti)}
                        style={{ display: 'none' }}
                      />
                    </motion.label>
                  );
                })}
              </div>

              {/* Clear + navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => handleAnswer(q.id, '', isMulti, true)}
                  disabled={submitStatus !== 'idle'}
                  style={{
                    background: 'none', border: 'none', 
                    cursor: submitStatus !== 'idle' ? 'not-allowed' : 'pointer',
                    opacity: submitStatus !== 'idle' ? 0.5 : 1,
                    fontSize: 13, color: 'var(--text-muted)', padding: 0,
                    transition: 'color 0.15s',
                    fontFamily: 'inherit',
                  }}
                  onMouseOver={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                  onMouseOut={e =>  (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  Clear selection
                </button>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                    disabled={currentIndex === 0}
                    className="btn btn-ghost"
                    style={{ padding: '7px 16px', fontSize: 13 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    Prev
                  </button>
                  <button
                    onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
                    disabled={currentIndex === questions.length - 1}
                    className="btn btn-ghost"
                    style={{ padding: '7px 16px', fontSize: 13 }}
                  >
                    Next
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Submit modal */}
      {showModal && (
        <SubmitModal
          answeredCount={answeredCount}
          total={questions.length}
          onCancel={() => setShowModal(false)}
          onConfirm={handleFinalSubmit}
        />
      )}
    </div>
  );
}
