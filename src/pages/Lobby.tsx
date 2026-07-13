import { useNavigate, useParams } from 'react-router-dom';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getRandomQuestions } from '../data/questionBank';
import { LocalStorage } from '../lib/storage';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import ThemeToggle from '../components/ThemeToggle';

type LobbyStatus = 'loading' | 'invalid' | 'ready';

export default function Lobby() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [lobbyStatus, setLobbyStatus] = useState<LobbyStatus>('loading');
  const [starting, setStarting] = useState(false);
  const user = auth.currentUser;

  /* ── Validate test ID against Firestore `assessments` collection ── */
  useEffect(() => {
    const validate = async () => {
      if (!testId) { setLobbyStatus('invalid'); return; }

      try {
        const assessmentRef = doc(db, 'assessments', testId);
        const snap = await getDoc(assessmentRef);

        if (snap.exists()) {
          setLobbyStatus('ready');
        } else {
          // In dev/demo: auto-create the demo assessment doc so the demo link always works.
          // In production, remove this block — assessment docs must be pre-created by admins.
          if (['demo-test-id', 'test-2', 'test-3'].includes(testId)) {
            await setDoc(assessmentRef, {
              title: 'Software Engineering Assessment',
              durationMinutes: 2,
              questionCount: 5,
              createdAt: serverTimestamp(),
            });
            setLobbyStatus('ready');
          } else {
            setLobbyStatus('invalid');
          }
        }
      } catch {
        // Offline: if we can't verify, allow if user already has an in-progress attempt
        try {
          const attemptRef = doc(db, 'attempts', `${user?.uid}_${testId}`);
          const attemptSnap = await getDoc(attemptRef);
          setLobbyStatus(attemptSnap.exists() ? 'ready' : 'invalid');
        } catch {
          setLobbyStatus('invalid');
        }
      }
    };

    validate();
  }, [testId, user?.uid]);

  const handleStart = async () => {
    if (!user || !testId) return;
    setStarting(true);

    try {
      const attemptRef = doc(db, 'attempts', `${user.uid}_${testId}`);
      const snap = await getDoc(attemptRef);

      if (snap.exists()) {
        const data = snap.data();
        if (data.status === 'submitted') {
          toast.error('You have already submitted this assessment.');
          setStarting(false);
          return;
        }
        navigate(`/assessment/${testId}`);
        return;
      }

      const selectedQuestions = getRandomQuestions(5);
      await setDoc(attemptRef, {
        userId: user.uid,
        testId,
        status: 'in-progress',
        startTime: serverTimestamp(),
        durationMinutes: 2,
        questions: selectedQuestions.map(q => q.id),
        answers: {},
        tabViolations: 0,
      });

      await LocalStorage.setItem('current_questions', selectedQuestions);
      navigate(`/assessment/${testId}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to start assessment. Please check your connection.');
    } finally {
      setStarting(false);
    }
  };

  const instructions = [
    'This is a timed test. The timer cannot be paused once started.',
    'If you go offline, your answers are saved locally and will sync when you reconnect.',
    'Do not switch tabs or minimize the browser. Tab switches are recorded and flagged.',
    'Copy and paste functionality is disabled during the assessment.',
    'Once the timer reaches zero, your test is automatically submitted.',
  ];

  /* ── Invalid link screen ── */
  if (lobbyStatus === 'invalid') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-base)', padding: '24px 16px' }}>
        <div className="surface" style={{ maxWidth: 440, width: '100%', padding: '40px 36px', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            backgroundColor: 'var(--accent-red-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '-0.02em' }}>
            Invalid Assessment Link
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 28 }}>
            This assessment link does not exist or has expired. Please use the link provided by your recruiter or administrator.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => navigate('/oa/demo-test-id')} className="btn btn-secondary" style={{ fontSize: 13 }}>
              Go Back
            </button>
            <button onClick={() => auth.signOut()} className="btn btn-ghost" style={{ fontSize: 13 }}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Loading validation ── */
  if (lobbyStatus === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-base)' }}>
        <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      </div>
    );
  }

  /* ── Main Lobby ── */
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-base)' }}>

      {/* Header */}
      <header style={{
        height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-default)',
        position: 'sticky', top: 0, zIndex: 40, flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>
          Hack<span style={{ color: 'var(--accent)' }}>Off</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle />
          <button onClick={() => auth.signOut()} className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }}>
            Sign out
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="lobby-body" style={{ flex: 1, display: 'flex' }}>

        {/* Left panel */}
        <motion.div
          className="lobby-left"
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: 320,
            flexShrink: 0,
            padding: '48px 36px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRight: '1px solid var(--border-default)',
          }}
        >
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Assessment
            </p>
            <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.25, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: 16 }}>
              Software Engineering Assessment
            </h1>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.5 }}>
              Welcome, <strong style={{ color: 'var(--text-primary)' }}>{user?.displayName || user?.email}</strong>
            </p>

            {/* Duration chip */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 6,
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              fontSize: 13, color: 'var(--text-secondary)',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Test duration: 2 minutes
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Powered by <strong style={{ color: 'var(--text-secondary)' }}>HackOff</strong>
          </p>
        </motion.div>

        {/* Right panel — instructions card */}
        <motion.div
          className="lobby-right"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 40px',
          }}
        >
          <div className="surface" style={{ maxWidth: 580, width: '100%', overflow: 'hidden' }}>

            {/* Instructions */}
            <div style={{ padding: '24px 28px' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: 18 }}>
                Instructions
              </h2>
              <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 13 }}>
                {instructions.map((item, i) => (
                  <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', minWidth: 18, paddingTop: 3 }}>{i + 1}.</span>
                    <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{item}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="divider" />

            {/* Test format table */}
            <div style={{ padding: '20px 28px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 14 }}>
                Test Format
              </h3>
              <div style={{ borderRadius: 6, border: '1px solid var(--border-default)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 90px', padding: '8px 16px', backgroundColor: 'var(--bg-overlay)', borderBottom: '1px solid var(--border-default)' }}>
                  {['No.', 'Section', 'Questions'].map(h => (
                    <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{h}</span>
                  ))}
                </div>
                {[
                  { section: 'Multiple Choice (MCQ)', count: 2 },
                  { section: 'Multi-select', count: 2 },
                  { section: 'True / False', count: 1 },
                ].map((row, i, arr) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 90px', padding: '10px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{i + 1}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{row.section}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{row.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="divider" />

            {/* CTA */}
            <div style={{ padding: '16px 28px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleStart} disabled={starting} className="btn btn-accent" style={{ padding: '9px 28px', fontSize: 14 }}>
                {starting ? <><Spinner /> Starting…</> : 'Continue'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

const Spinner = () => (
  <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
  </svg>
);
