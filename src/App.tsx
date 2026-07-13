import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Lobby from './pages/Lobby';
import Assessment from './pages/Assessment';
import { useEffect, useState } from 'react';
import { auth } from './lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
