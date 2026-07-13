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
  // Removed manual offline recovery logic in favor of Firebase native queue

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
