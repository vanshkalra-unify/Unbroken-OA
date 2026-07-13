# Online Assessment (OA) System Design & Developer Prompts

This document stores the design decisions, architectural reasoning, and developer notes for building the HackerRank-style Online Assessment app — **HackOff**.

**Production URL**: `hackoff.vercel.app`

---

## 1. Core Architecture Decisions

### Storage & Offline Capabilities
**Decision**: Hybrid approach — **Firebase Offline Persistence** (IndexedDB via Firestore SDK) + **LocalForage** for UI state (`current_questions`, `current_index`, draft answers).

- *Why not LocalStorage?* 5MB limit, synchronous/blocking, strings only.
- *Why Firebase Offline Persistence?* Automatically queues writes; syncs on reconnect without custom logic.
- *Why LocalForage?* Tracks exact UI state for hard-refresh / tab-close recovery. Stored in an IndexedDB database named `OnlineAssessmentApp`, object store `oa_state`.

**Keys stored in `oa_state`**:
| Key | Value | Cleared |
|---|---|---|
| `current_questions` | Array of question objects for the session | On submit |
| `current_index` | Integer, the last viewed question index | On submit |
| `answers` | `Record<questionId, string \| string[]>` | On submit |
| `attempt_start_time` | Integer timestamp (ms) | On submit |
| `attempt_duration` | Integer (minutes) | On submit |
| `pending_offline_submission` | Boolean `true` | On recovery sync / submit |

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

### Architecture Shift: Strict Server-Enforced Time Limits
Initially, the app used an **Offline-First (Trust the Payload)** approach where manual payloads were constructed and synced via `App.tsx` upon reconnection. This was completely replaced with a **Strict Server-Enforced Architecture**.

**Why?** Trusting the client payload allows highly sophisticated users to manipulate their local clock and submit late answers. By relying purely on Firebase's native offline queue and strict server-side rules, we eliminate this attack vector entirely while still retaining graceful offline degradation.

**How it works (The Security Rule):**
In production, Firestore rules must enforce that `answers` cannot be updated past the time limit, but `status` CAN be updated to `'submitted'` late.
```javascript
match /attempts/{attemptId} {
  allow update: if request.auth.uid == resource.data.userId &&
    (
      // CONDITION 1: Within time limit -> can update answers & status
      request.time <= resource.data.startTime + duration.value(resource.data.durationMinutes + 1, 'm')
      ||
      // CONDITION 2: Past time limit -> can ONLY update status to 'submitted'
      (
        request.resource.data.status == 'submitted' &&
        request.resource.data.answers == resource.data.answers 
      )
    );
}
```

**What happens if a user is offline when the timer ends?**
1. User loses internet at 15m. Clicks Option B. (Queued by Firebase SDK).
2. Timer expires at 30m. App triggers auto-submit. (Queued by Firebase SDK).
3. User regains internet at 35m. Firebase SDK flushes the queue.
4. The server evaluates the rules at 35m.
5. The offline answer update (Option B) is **REJECTED** because it violates Condition 1 and modifies `answers` (violating Condition 2).
6. The auto-submit update (`status: 'submitted'`) is **ACCEPTED** because it satisfies Condition 2.
7. **Result**: The test is successfully submitted using ONLY the answers they selected when they were last online. Late offline clicks are silently dropped.

### Hardened Offline UI Behaviors
1. **Post-Submission Lock**: Once the timer ends offline, `submitStatus` becomes `'pending'`. All options are visually disabled (`opacity: 0.7`) to prevent users from queueing further useless answer updates.
2. **Refresh Bypass Prevention**: If a user refreshes the page while offline and past the time limit, Firebase's local cache optimisticly returns `status === 'submitted'`. The app instantly boots them back to the Lobby page instead of letting them re-enter the test.
3. **Time Freezing & Tampering**: `Timer.tsx` calculates remaining time using `Date.now()` against a fixed `endTime` (`startTime + durationMinutes`), making it resistant to JavaScript pausing. 
4. **Post-Submission Redirect**: After the assessment is submitted (either manually or automatically at time over), the user is gracefully redirected to the Lobby (`/oa/<testId>`) rather than being kicked back to the generic `/login` screen. 

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
- **Palette**: Vercel-inspired **Interstellar Black & White** — pure black base (`#000000`), near-black surface (`#0a0a0a`), elevated greys (`#111111`, `#171717`). This replaces the earlier navy/GitHub palette.
- **Accent**: Inverted high-contrast system — **white (`#ffffff`) on dark mode**, **black (`#000000`) on light mode** — with `--accent-fg` being the opposite. This gives buttons and selected states a crisp, editorial feel without relying on color hue.
- **Text**: `#ededed` (primary), `#a1a1aa` (secondary), `#71717a` (muted) — warm near-whites on deep black.
- **Status Colors**: Blue (`#3b82f6`), orange (`#f59e0b`), red (`#ef4444`), green (`#10b981`) — used only for semantic UI states (timer warning, errors).
- **Borders**: Extremely subtle — `#1f1f22` (subtle), `#333333` (default), `#444444` (strong).
- **Typography**: Inter (Google Fonts) for UI, JetBrains Mono for the timer.
- **Glassmorphism**: `glass` and `glass-panel` CSS utility classes using `rgba(10,10,10,0.6)` with `backdrop-filter: blur()` for the Assessment header and Submit modal.
- **Background Utility**: `.bg-grid` class adds a subtle dot-grid pattern (inspired by Vercel landing pages) using `linear-gradient` on `--border-subtle`.
- **Buttons**: Pill-shaped (`border-radius: 9999px`) throughout for a modern, Vercel-native aesthetic.

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
