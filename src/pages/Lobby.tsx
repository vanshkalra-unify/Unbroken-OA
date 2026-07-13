import { useNavigate, useParams } from 'react-router-dom';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getRandomQuestions } from '../data/questionBank';
import { LocalStorage } from '../lib/storage';
import { useState } from 'react';

export default function Lobby() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStart = async () => {
    if (!auth.currentUser || !testId) return;
    setLoading(true);
    setError('');

    try {
      const attemptRef = doc(db, 'attempts', `${auth.currentUser.uid}_${testId}`);
      const attemptSnap = await getDoc(attemptRef);

      if (attemptSnap.exists()) {
        const data = attemptSnap.data();
        if (data.status === 'submitted') {
          setError('You have already submitted this assessment.');
          setLoading(false);
          return;
        }
        // If in-progress, we just navigate
        navigate(`/assessment/${testId}`);
        return;
      }

      // Create new attempt
      const selectedQuestions = getRandomQuestions(5);
      
      await setDoc(attemptRef, {
        userId: auth.currentUser.uid,
        testId: testId,
        status: 'in-progress',
        startTime: serverTimestamp(), // Secure server time
        durationMinutes: 2, // example duration
        questions: selectedQuestions.map(q => q.id),
        answers: {},
        tabViolations: 0
      });

      // Cache the question objects locally for offline access
      await LocalStorage.setItem('current_questions', selectedQuestions);
      
      navigate(`/assessment/${testId}`);
    } catch (err: any) {
      console.error(err);
      setError('Failed to start assessment. Are you offline?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div className="glass-card max-w-2xl w-full p-8 relative z-10">
        <h1 className="text-3xl font-bold mb-4">Software Engineering Assessment</h1>
        
        <div className="space-y-6 text-slate-300">
          <p className="text-lg">Welcome, {auth.currentUser?.displayName || auth.currentUser?.email}</p>
          
          <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
            <h3 className="text-xl font-semibold text-white mb-4">Instructions</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>You will have <strong>2 minutes</strong> to complete 5 questions.</li>
              <li>The timer will not pause if you close or refresh the tab.</li>
              <li>Once the timer reaches zero, your answers will be automatically submitted.</li>
              <li>Do not switch tabs or minimize the window. We monitor tab switches and log violations.</li>
              <li>Copy and paste are disabled.</li>
              <li>If your internet drops, keep answering! Your answers are saved offline and will sync automatically.</li>
            </ul>
          </div>

          {error && <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200">{error}</div>}

          <div className="pt-4 flex justify-between items-center">
            <button 
              onClick={() => auth.signOut()} 
              className="text-slate-400 hover:text-white transition-colors"
            >
              Sign Out
            </button>
            <button 
              onClick={handleStart}
              disabled={loading}
              className="bg-accent hover:bg-accent/90 text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-accent/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? 'Starting...' : 'Start Assessment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
