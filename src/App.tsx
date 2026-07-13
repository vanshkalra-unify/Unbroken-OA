import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Lobby from './pages/Lobby';
import Assessment from './pages/Assessment';
import { useEffect, useState } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { LocalStorage } from './lib/storage';
import { doc, updateDoc } from 'firebase/firestore';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMessage, setRecoveryMessage] = useState('');

  // Global Offline Recovery Hook
  useEffect(() => {
    const handleOnlineRecovery = async () => {
      if (!user) return;
      const pendingSubmit = (await LocalStorage.getItem('pending_offline_submission')) as any;
      if (pendingSubmit && navigator.onLine) {
        try {
          const attemptRef = doc(db, 'attempts', `${user.uid}_${pendingSubmit.testId}`);
          await updateDoc(attemptRef, {
            status: 'submitted',
            answers: pendingSubmit.answers,
            submittedAt: new Date(),
            offlineRecovered: true
          });
          await LocalStorage.removeItem('pending_offline_submission');
          await LocalStorage.removeItem('answers');
          await LocalStorage.removeItem('current_questions');
          await LocalStorage.removeItem('current_index');
          setRecoveryMessage("We noticed you completed the assessment while offline earlier. Your connection has been restored, and your test was successfully submitted to our servers just now. Thank you!");
        } catch (err) {
          console.error("Failed to recover offline submission:", err);
        }
      }
    };

    window.addEventListener('online', handleOnlineRecovery);
    handleOnlineRecovery(); // check on mount too

    return () => window.removeEventListener('online', handleOnlineRecovery);
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (recoveryMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="glass-card max-w-lg p-8 text-center border-accent/50 shadow-[0_0_40px_rgba(16,185,129,0.2)]">
          <div className="w-16 h-16 bg-accent/20 text-accent rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-4 text-white">Successfully Recovered!</h2>
          <p className="text-slate-300 leading-relaxed mb-8">{recoveryMessage}</p>
          <button 
            onClick={() => setRecoveryMessage('')}
            className="bg-accent hover:bg-accent/90 text-white px-8 py-3 rounded-lg font-bold transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/oa/demo-test-id" />} />
        {/* We use a hardcoded demo test id for now, but in reality it would be a unique link */}
        <Route path="/oa/:testId" element={user ? <Lobby /> : <Navigate to="/login" />} />
        <Route path="/assessment/:testId" element={user ? <Assessment /> : <Navigate to="/login" />} />
        
        {/* Default fallback */}
        <Route path="*" element={<Navigate to={user ? "/oa/demo-test-id" : "/login"} />} />
      </Routes>
    </Router>
  );
}

export default App;
