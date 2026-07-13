import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Lobby from './pages/Lobby';
import Assessment from './pages/Assessment';
import { useEffect, useState } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { LocalStorage } from './lib/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { ThemeProvider } from './context/ThemeContext';
import { Toaster } from 'sonner';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryState, setRecoveryState] = useState<'idle' | 'success' | 'failed'>('idle');

  // Global Offline Recovery Hook — runs when user comes online
  useEffect(() => {
    const handleOnlineRecovery = async () => {
      if (!user) return;
      const pendingSubmit = (await LocalStorage.getItem('pending_offline_submission')) as any;

      // Security: verify the pending submission belongs to the current user
      if (pendingSubmit && navigator.onLine && pendingSubmit.userId === user.uid) {
        try {
          const attemptRef = doc(db, 'attempts', `${user.uid}_${pendingSubmit.testId}`);
          await updateDoc(attemptRef, {
            status: 'submitted',
            answers: pendingSubmit.answers,
            submittedAt: new Date(),
            offlineRecovered: true,
          });
          await LocalStorage.removeItem('pending_offline_submission');
          await LocalStorage.removeItem('answers');
          await LocalStorage.removeItem('current_questions');
          await LocalStorage.removeItem('current_index');
          setRecoveryState('success');
        } catch (err) {
          console.error('Failed to recover offline submission:', err);
          setRecoveryState('failed');
        }
      }
    };

    window.addEventListener('online', handleOnlineRecovery);
    handleOnlineRecovery();
    return () => window.removeEventListener('online', handleOnlineRecovery);
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Initial auth loading
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-base)',
      }}>
        <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      </div>
    );
  }

  // Offline recovery confirmation screen
  if (recoveryState !== 'idle') {
    const isSuccess = recoveryState === 'success';
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-base)',
        padding: '24px 16px',
      }}>
        <div className="surface" style={{
          maxWidth: 480,
          width: '100%',
          padding: '40px 36px',
          textAlign: 'center',
        }}>
          {/* Icon */}
          <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            backgroundColor: isSuccess ? 'var(--accent-subtle)' : 'var(--accent-red-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            {isSuccess ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            )}
          </div>

          <h2 style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            marginBottom: 12,
          }}>
            {isSuccess ? 'Assessment Submitted' : 'Submission Failed'}
          </h2>

          <p style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: 'var(--text-secondary)',
            marginBottom: 28,
          }}>
            {isSuccess
              ? 'We detected that you completed your assessment while offline. Now that your connection is restored, your answers have been securely submitted to our servers.'
              : 'We found a pending submission but were unable to upload it. Please try again or contact support.'}
          </p>

          <button
            onClick={() => setRecoveryState('idle')}
            className="btn btn-accent"
            style={{ padding: '9px 28px', fontSize: 14 }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/oa/demo-test-id" />} />
          <Route path="/oa/:testId" element={user ? <Lobby /> : <Navigate to="/login" />} />
          <Route path="/assessment/:testId" element={user ? <Assessment /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to={user ? '/oa/demo-test-id' : '/login'} />} />
        </Routes>
      </Router>
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13 },
        }}
      />
    </ThemeProvider>
  );
}

export default App;
