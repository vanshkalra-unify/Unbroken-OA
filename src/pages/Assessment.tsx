import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { LocalStorage } from '../lib/storage';
import Timer from '../components/Timer';
import type { Question } from '../data/questionBank';

export default function Assessment() {
  const { testId } = useParams();
  const navigate = useNavigate();
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [loading, setLoading] = useState(true);
  const [attemptData, setAttemptData] = useState<any>(null);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'pending' | 'submitted'>('idle');

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      if (!auth.currentUser || !testId) return navigate('/login');
      
      const attemptRef = doc(db, 'attempts', `${auth.currentUser.uid}_${testId}`);
      
      try {
        const snap = await getDoc(attemptRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.status === 'submitted') {
            navigate('/login'); // already submitted
            return;
          }
          setAttemptData(data);
          
          // Load answers from local or DB
          const localAnswers = (await LocalStorage.getItem('answers')) as Record<string, string | string[]> || {};
          setAnswers({ ...(data.answers as Record<string, string | string[]>), ...localAnswers });
          
          // Try to load cached questions and index
          const cachedQ = await LocalStorage.getItem('current_questions');
          if (cachedQ) setQuestions(cachedQ as Question[]);
          const savedIndex = await LocalStorage.getItem('current_index');
          if (savedIndex !== null) setCurrentIndex(savedIndex as number);
        }
      } catch (err) {
        console.error("Error loading attempt (might be offline):", err);
        // Fallback to local storage if totally offline and cache exists
        const cachedQ = await LocalStorage.getItem('current_questions');
        const localAnswers = await LocalStorage.getItem('answers') || {};
        const savedIndex = await LocalStorage.getItem('current_index');
        
        if (cachedQ) {
          setQuestions(cachedQ as Question[]);
          setAnswers(localAnswers as Record<string, string | string[]>);
          if (savedIndex !== null) setCurrentIndex(savedIndex as number);
          // We need a dummy attemptData to show the timer
          setAttemptData({
            startTime: { toDate: () => new Date() }, // fallback
            durationMinutes: 2
          });
        }
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [testId, navigate]);

  // Save currentIndex to localForage on change
  useEffect(() => {
    LocalStorage.setItem('current_index', currentIndex);
  }, [currentIndex]);

  // Anti-cheating listeners
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden && auth.currentUser && testId) {
        // Tab switched
        console.warn("Tab switch detected!");
        const attemptRef = doc(db, 'attempts', `${auth.currentUser.uid}_${testId}`);
        try {
          const snap = await getDoc(attemptRef);
          if (snap.exists()) {
            await updateDoc(attemptRef, {
              tabViolations: (snap.data().tabViolations || 0) + 1
            });
          }
        } catch (e) {
          // might be offline
        }
        alert("Warning: Tab switching is not allowed. This violation has been recorded.");
      }
    };

    const disableCopy = (e: ClipboardEvent) => e.preventDefault();
    const disableContextMenu = (e: MouseEvent) => e.preventDefault();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("copy", disableCopy);
    document.addEventListener("contextmenu", disableContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("copy", disableCopy);
      document.removeEventListener("contextmenu", disableContextMenu);
    };
  }, [testId]);

  // Handle final submission queued when offline but now online
  useEffect(() => {
    if (!isOffline && submitStatus === 'pending' && auth.currentUser && testId) {
      handleFinalSubmit();
    }
  }, [isOffline, submitStatus]);

  const handleAnswerSelect = async (questionId: string, option: string, isMulti: boolean, isClear: boolean = false) => {
    setAnswers(prev => {
      const current = prev[questionId];
      let newAns;
      
      if (isClear) {
        newAns = isMulti ? [] : '';
      } else if (isMulti) {
        const arr = Array.isArray(current) ? current : [];
        if (arr.includes(option)) {
          newAns = arr.filter(o => o !== option);
        } else {
          newAns = [...arr, option];
        }
      } else {
        newAns = option;
      }
      
      const updated = { ...prev, [questionId]: newAns };
      
      // Save locally
      LocalStorage.setItem('answers', updated);
      
      // Sync to Firestore
      if (auth.currentUser && testId) {
        const attemptRef = doc(db, 'attempts', `${auth.currentUser.uid}_${testId}`);
        updateDoc(attemptRef, { answers: updated }).catch(e => console.log('Offline queueing write', e));
      }
      
      return updated;
    });
  };

  const handleFinalSubmit = async () => {
    if (!auth.currentUser || !testId) return;
    setSubmitStatus('pending');
    
    if (isOffline) {
      LocalStorage.setItem('pending_offline_submission', {
        testId,
        answers
      });
      alert("You are offline. Your answers are saved securely. Do not close this tab; it will submit automatically when the connection is restored. If you accidentally close it, it will sync next time you open the app online.");
      return;
    }

    try {
      const attemptRef = doc(db, 'attempts', `${auth.currentUser.uid}_${testId}`);
      await updateDoc(attemptRef, { 
        status: 'submitted', 
        answers,
        submittedAt: new Date()
      });
      setSubmitStatus('submitted');
      await LocalStorage.clear();
      alert("Assessment submitted successfully!");
      navigate('/login');
    } catch (err) {
      console.error(err);
      alert("Failed to submit. Will retry when online.");
    }
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center text-white">Loading Assessment...</div>;
  if (!questions.length) return <div className="min-h-screen bg-background flex items-center justify-center text-white">No questions found.</div>;

  const currentQ = questions[currentIndex];
  const currentAns = answers[currentQ.id];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col user-select-none">
      {/* Offline Banner */}
      {isOffline && (
        <div className="bg-red-500/90 text-white text-center py-2 px-4 sticky top-0 z-50 font-medium animate-pulse flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
          You are currently offline. Answers are saved locally.
        </div>
      )}

      {/* Header */}
      <header className="glass px-6 py-4 flex justify-between items-center sticky top-0 z-40 border-b border-slate-700/50">
        <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">OA Platform</h2>
        {attemptData?.startTime && (
          <Timer 
            startTime={attemptData.startTime.toDate ? attemptData.startTime.toDate() : new Date()} 
            durationMinutes={attemptData.durationMinutes || 2} 
            onExpire={handleFinalSubmit} 
          />
        )}
        <button onClick={handleFinalSubmit} disabled={submitStatus === 'submitted'} className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg font-medium transition-colors">
          {submitStatus === 'pending' ? 'Submitting...' : 'Submit Test'}
        </button>
      </header>

      <main className="flex-1 flex w-full max-w-6xl mx-auto mt-8 gap-8 px-4">
        {/* Sidebar Nav */}
        <div className="w-64 flex-shrink-0">
          <div className="glass-card p-4 sticky top-24">
            <h3 className="font-semibold text-slate-300 mb-4">Questions</h3>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isAnswered = answers[q.id] && (Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).length > 0 : true);
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-10 w-10 rounded-lg flex items-center justify-center text-sm font-medium transition-all ${currentIndex === idx ? 'bg-primary text-white ring-2 ring-primary ring-offset-2 ring-offset-background' : isAnswered ? 'bg-accent/20 text-accent border border-accent/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Question Area */}
        <div className="flex-1 max-w-3xl">
          <div className="glass-card p-8 min-h-[400px] flex flex-col">
            <div className="flex justify-between items-start mb-6 border-b border-slate-700/50 pb-4">
              <h2 className="text-2xl font-semibold leading-relaxed">
                <span className="text-primary mr-3 text-xl">Q{currentIndex + 1}.</span>
                {currentQ.text}
              </h2>
              <span className="text-xs px-3 py-1 bg-slate-800 rounded-full text-slate-400 uppercase tracking-wider font-semibold ml-4 shrink-0">
                {currentQ.type === 'multiselect' ? 'Multi Select' : currentQ.type === 'truefalse' ? 'True / False' : 'Single Choice'}
              </span>
            </div>

            <div className="space-y-3 flex-1">
              {currentQ.options.map((opt, i) => {
                const isMulti = currentQ.type === 'multiselect';
                const isSelected = isMulti 
                  ? Array.isArray(currentAns) && currentAns.includes(opt)
                  : currentAns === opt;

                return (
                  <label 
                    key={i} 
                    className={`flex items-center p-4 rounded-xl cursor-pointer border transition-all ${isSelected ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'bg-slate-800/40 border-slate-700 hover:bg-slate-800 hover:border-slate-600'}`}
                  >
                    <div className={`w-5 h-5 flex flex-shrink-0 items-center justify-center mr-4 border transition-colors ${isMulti ? 'rounded-md' : 'rounded-full'} ${isSelected ? 'bg-primary border-primary' : 'border-slate-500'}`}>
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-lg text-slate-200">{opt}</span>
                    <input
                      type={isMulti ? "checkbox" : "radio"}
                      name={`question-${currentQ.id}`}
                      value={opt}
                      checked={isSelected}
                      onChange={() => handleAnswerSelect(currentQ.id, opt, isMulti)}
                      className="hidden"
                    />
                  </label>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => handleAnswerSelect(currentQ.id, '', currentQ.type === 'multiselect', true)}
                className="text-sm font-medium text-slate-400 hover:text-white underline transition-colors"
              >
                Clear Selection
              </button>
            </div>

            <div className="mt-4 pt-6 border-t border-slate-700/50 flex justify-between">
              <button 
                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
                className="px-5 py-2.5 rounded-lg font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button 
                onClick={() => setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1))}
                disabled={currentIndex === questions.length - 1}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
