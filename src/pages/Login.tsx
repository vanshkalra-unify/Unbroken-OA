import { useState } from 'react';
import { motion } from 'framer-motion';
import { auth } from '../lib/firebase';
import {
  signInWithPopup, GoogleAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
} from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/oa/demo-test-id');
    } catch (err: any) {
      const msg = err.code === 'auth/invalid-credential'
        ? 'Invalid email or password.'
        : err.code === 'auth/email-already-in-use'
        ? 'An account with this email already exists.'
        : err.code === 'auth/weak-password'
        ? 'Password must be at least 6 characters.'
        : 'Something went wrong. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate('/oa/demo-test-id');
    } catch (err){
      console.log("Google sign-in error: ", err);
      toast.error('Google sign-in was cancelled or failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-grid" style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-base)' }}>

      {/* ── Left branding panel ── */}
      <div
        className="login-left-panel glass-panel"
        style={{
          width: 480,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 'min(5vh, 56px) min(4vw, 64px)',
        }}
      >
        <div>
          {/* Wordmark */}
          <div style={{ marginBottom: 'min(5vh, 56px)' }}>
            <span style={{
              fontSize: 'clamp(20px, 2vw, 22px)',
              fontWeight: 800,
              letterSpacing: '-0.04em',
              color: 'var(--text-primary)',
            }}>
              Hack<span style={{ color: 'var(--accent)' }}>Off</span>
            </span>
          </div>

          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 style={{
              fontSize: 'clamp(26px, 3vw, 32px)',
              fontWeight: 800,
              lineHeight: 1.2,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
              marginBottom: 'min(2vh, 16px)',
            }}>
              Assess your skills.<br />
              Prove your potential.
            </h1>
            <p style={{ fontSize: 'clamp(13px, 1.2vw, 14px)', lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: 300 }}>
              A secure, offline-ready assessment platform designed for developers. Your answers are always saved - even without a connection.
            </p>
          </motion.div>

          {/* Feature list */}
          <div style={{ marginTop: 'min(4vh, 40px)', display: 'flex', flexDirection: 'column', gap: 'min(1.5vh, 16px)' }}>
            {[
              { icon: ShieldIcon, text: 'Proctored - tab switches are monitored' },
              { icon: WifiIcon, text: 'Offline-first - never lose your progress' },
              { icon: ClockIcon, text: 'Server-synced timer, tamper-proof' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  backgroundColor: 'var(--accent-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={14} color="var(--accent)" />
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          © 2026 HackOff. All rights reserved.
        </p>
      </div>

      {/* ── Right auth panel ── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 24, right: 32 }}>
          <ThemeToggle />
        </div>

        <motion.div
          className="glass"
          style={{ width: '100%', maxWidth: 420, padding: 'min(4vh, 40px)' }}
          initial={{ opacity: 0, scale: 0.98, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Mobile wordmark — only visible when left panel is hidden */}
          <div className="login-mobile-wordmark" style={{ marginBottom: 24 }}>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>
              Hack<span style={{ color: 'var(--accent)' }}>Off</span>
            </span>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {mode === 'signin' ? 'Sign in to HackOff' : 'Create your account'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
            {mode === 'signin' ? 'Access your scheduled assessment.' : 'Register to take your assessment.'}
          </p>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="btn btn-secondary"
            style={{ width: '100%', padding: '9px 16px', marginBottom: 16, fontSize: 13 }}
          >
            <GoogleLogo />
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div className="divider" style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>or with email</span>
            <div className="divider" style={{ flex: 1 }} />
          </div>

          {/* Form */}
          <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-accent"
              style={{ width: '100%', padding: '9px 16px', marginTop: 4, fontSize: 14 }}
            >
              {loading ? <Spinner /> : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)', fontWeight: 500, fontSize: 13 }}
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

/* ── Inline icons ── */
const ShieldIcon = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const WifiIcon = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
  </svg>
);
const ClockIcon = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const GoogleLogo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);
const Spinner = () => (
  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
  </svg>
);

