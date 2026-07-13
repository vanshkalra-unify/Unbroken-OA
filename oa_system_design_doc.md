# Online Assessment (OA) System Design & Developer Prompts

This document stores the design decisions, architectural reasoning, and developer notes for building the HackerRank-style Online Assessment app — **HackOff**.

**Production URL**: `hackoff.vercel.app`

---

## 1. Core Architecture Decisions

### Storage & Offline Capabilities
**Decision**: Hybrid approach — **Firebase Offline Persistence** (IndexedDB via Firestore SDK) + **LocalForage** for UI state (currentIndex, draft answers, pending submission flag).

- *Why not LocalStorage?* 5MB limit, synchronous/blocking, strings only.
- *Why Firebase Offline Persistence?* Automatically queues writes; syncs on reconnect without custom logic.
- *Why LocalForage?* Tracks exact UI state (timer offset, last question, pending submission) for hard-refresh / tab-close recovery. Stored in an IndexedDB database named `OnlineAssessmentApp`, object store `oa_state`.

**Keys stored in `oa_state`**:
| Key | Value | Cleared |
|---|---|---|
| `current_questions` | Array of question objects for the session | On submit |
| `current_index` | Integer, the last viewed question index | On submit |
| `answers` | `Record<questionId, string \| string[]>` | On submit |
| `pending_offline_submission` | `{ testId, userId, answers }` | On recovery sync |

### Syncing Strategy
Sync on **each answer selection** (not on submit). Firebase SDK queues writes when offline and flushes on reconnection — no manual batching required.

### Offline App Shell (PWA)
**Decision**: Adopt `vite-plugin-pwa` to cache the React App Shell (HTML/CSS/JS bundles) in the browser's **Cache Storage API**.
- *What we are doing*: Generating and registering a Service Worker using `vite-plugin-pwa` with `registerType: 'autoUpdate'`.
- *How we are doing it*: Configured the Vite plugin in `vite.config.ts`. The Service Worker intercepts network requests. When the internet connection is lost and the user refreshes in production, it serves the cached `index.html` and assets instantly instead of showing the browser's default offline page (the Dinosaur game). This perfectly complements Firebase Offline Persistence which handles the data layer.
- *Important*: `devOptions.enabled` is set to `false` in `vite.config.ts` so the Service Worker only activates in the production build. The `dev-dist/` folder generated locally is excluded via `.gitignore`.

### Edge Case: Accidental Tab Close
**Decision**: Case 2 — **Direct Resume** (no re-login).
Firebase Auth persists the session natively. On reopen, the app reads `currentIndex` from LocalForage and drops the user exactly back on the last question they were viewing. The server-side timer continues ticking naturally.

### Edge Case: Offline Submission Recovery
When a user submits offline, a `pending_offline_submission` flag (containing `testId`, `userId`, and `answers`) is saved to LocalForage. On next app launch (online), `App.tsx` runs a recovery check on startup. If found and the `userId` matches the currently logged-in user, it pushes the final answers to Firestore and shows a styled recovery message. The check includes user validation to prevent pushing answers to the wrong Firestore document if a different user logs in on the same shared device.

### Security: Post-Submission Lock (Offline Mode Exploit Fix)
**Problem**: After submitting offline (timer expired or manual submit), the UI remained interactive. The Firebase SDK would queue those post-submission answer updates and flush them to Firestore when the connection returned, allowing malicious users to modify answers after time had run out.

**Fix**: An early return was added inside `handleAnswer` in `Assessment.tsx` to reject any answer update if `submitStatus !== 'idle'`. All option inputs, checkboxes, and the "Clear selection" button are also `disabled` and visually greyed out (`opacity: 0.7, cursor: not-allowed`) once the test is locked.

### Malicious Cheating Analysis (Offline Mode Exploits)
1. **Time Freezing**: User goes offline, takes hours to answer, comes back online. → *Mitigation*: The `submittedAt` server timestamp is compared against `startTime + durationMinutes` by Firestore Security Rules. Late submissions are rejected.
2. **Post-Submission Answer Modification**: User modifies answers after offline timer expiry. → *Mitigation*: `handleAnswer` is gated by `submitStatus`. See above.
3. **Clearing Cache to wipe tab violations**: User clears IndexedDB to remove `tabViolations`. → *Mitigation*: Wiping IndexedDB also erases their cached answers and `pending_offline_submission` flag, destroying their own progress.

---

## 2. Security: Test ID Validation (URL Manipulation Attack)

### Problem
Without validation, any user can craft an arbitrary URL like `/oa/any-made-up-id` and start a brand new test attempt with that ID. This is a significant security hole in production.

### Options Considered
- **Option A — Client-side allowlist**: Hardcode valid test IDs in `.env`. Simple but leaks IDs, requires redeployment for new tests.
- **Option B — Firestore `assessments` collection check**: On Lobby mount, verify the `testId` exists in `assessments/{testId}` before allowing the user to start. This is the correct production pattern.

### Decision: Option B (Firestore Verification)
**Implementation**: In `Lobby.tsx`, a `useEffect` runs on mount. It fetches `assessments/{testId}`. If the document doesn't exist, it sets an error state (`'invalid'`) and shows a "This assessment link is invalid." screen. If it exists, the Lobby renders normally.

**Creating New Test IDs (Production)**: Admins must manually create documents in the `assessments` Firestore collection with the following fields:
- `title` (string): Assessment title shown in the Lobby.
- `durationMinutes` (number): Timer length.
- `questionCount` (number): Number of questions.
- `createdAt` (timestamp): Creation timestamp.

The test link is then: `hackoff.vercel.app/oa/<document-id>`.

**Demo Workaround**: A seed document `assessments/demo-test-id` is auto-created in Firestore the first time it is visited if missing. In production, assessment documents must be pre-created by administrators.

---

## 3. UI & Layout Design Decisions

### Theme
- **Brand name**: HackOff
- **Dark mode palette**: Deep navy/GitHub-style (`#0d1117` base, `#161b22` surface)
- **Accent color**: Purple (`#8b5cf6` in dark, `#7c3aed` in light) — changed from green to differentiate the brand while remaining professional.
- **Typography**: Inter (Google Fonts) for UI, JetBrains Mono for the timer.
- **Glassmorphism**: `glass` and `glass-panel` CSS utility classes used in the Assessment header and Submit modal for a premium frosted-glass appearance.

### Assessment Option Styling
Option rows use highly rounded corners (`borderRadius: 12`), larger padding (`16px 20px`), and a cleaner monochromatic selection state (white/`--text-primary` fill instead of blue accent) to match the brand aesthetic.

### Responsive Strategy
- **Login**: Left branding panel hidden below 900px; form takes full width.
- **Lobby**: Two-column layout stacks vertically below 768px.
- **Assessment**: Sidebar collapses entirely on mobile. A top progress bar replaces it. Questions fill the full width with horizontal padding.
- **Breakpoints** managed via CSS media queries embedded in `index.css`.

### Assessment Layout
- The question pane uses `max-width: 800px` with `margin: 0 auto` to feel centered on large screens without leaving excessive whitespace.
- Options expand to fill the available width of the question card.
- Navigation (Prev/Next) and "Clear selection" are always pinned to the bottom of the content area.

---

## 4. Bug Fixes & Edge Case Hardening

### Bugs Fixed
1. **Inline `document.head.appendChild` in `Login.tsx`**: This ran as a module-level side effect on every import, potentially creating duplicate `<style>` tags. **Fix**: Moved responsive CSS into `index.css` media queries.
2. **App loading spinner used old Tailwind class names** that no longer exist after CSS token migration. **Fix**: Replaced with inline-styled spinner matching the new design system.
3. **Double-submission**: The submit button is disabled immediately when `submitStatus` changes from `'idle'`, preventing double-clicks. No change needed.
4. **Firebase Auth session persistence on recovery**: The `pending_offline_submission` object in LocalForage contained `testId` but not `userId`. If a different user logged in on the same device, the recovery would push to the wrong user's Firestore document. **Fix**: The recovery check in `App.tsx` now also validates that `user.uid` matches the `userId` stored alongside the pending submission.
5. **Firestore Security Rules**: `submittedAt` timestamp should be validated server-side to prevent late offline submissions. (Documented here; Firestore rules to be updated in production.)
6. **Post-submission answer updates in offline mode**: After the timer expired or Submit was clicked offline, the UI remained interactive. Firebase SDK would queue those updates and flush them on reconnection. **Fix**: `handleAnswer` now has an early return if `submitStatus !== 'idle'`. All inputs are disabled and greyed out. See Section 1 for full analysis.

---

## 5. Infrastructure & Deployment

### Hosting: Vercel
- **Production URL**: `hackoff.vercel.app`
- **Platform**: Vercel (migrated from Firebase Hosting)
- **SPA Routing Fix**: A `vercel.json` file at the project root rewrites all traffic to `index.html` so React Router handles client-side navigation. Without this, direct navigation to routes like `/login` or `/oa/demo-test-id` returns a 404.
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
- **Environment Variables**: All `VITE_FIREBASE_*` variables must be added via the Vercel Dashboard → Settings → Environment Variables. The app will not function without them in production. After adding, a redeployment is required.

### Firebase Console Setup (Required for Production)
1. **Authentication → Sign-in method**: Enable "Google" as a provider.
2. **Authentication → Settings → Authorized domains**: Add `hackoff.vercel.app` to allow Google Sign-In from the production domain.
3. **Firestore**: Create documents in the `assessments` collection for each test (see Section 2 for required fields).

### Environment Variables Reference
| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase project API key (starts with `AIza`) |
| `VITE_FIREBASE_AUTH_DOMAIN` | e.g., `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | e.g., `oa-app-a6c88` |
| `VITE_FIREBASE_STORAGE_BUCKET` | e.g., `your-project.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Numeric sender ID |
| `VITE_FIREBASE_APP_ID` | Full app ID string |

---

## 6. Tech Stack Summary
- **Frontend**: React 19 + Vite 8, TypeScript
- **Styling**: Vanilla CSS (CSS custom properties + Tailwind v4), Inter + JetBrains Mono fonts, glassmorphism utility classes
- **Animations**: Framer Motion
- **Toasts**: Sonner
- **Backend/DB**: Firebase Authentication + Cloud Firestore (offline persistence enabled)
- **PWA**: `vite-plugin-pwa` (Service Worker, Cache Storage API)
- **Hosting**: Vercel (`hackoff.vercel.app`)
- **Routing Fix**: `vercel.json` rewrite rule for SPA navigation
