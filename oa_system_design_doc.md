# Online Assessment (OA) System Design & Developer Prompts

This document stores the design decisions, architectural reasoning, and AI prompts/answers for building the HackerRank-style Online Assessment app.

---

## 1. Core Architecture Decisions

### Storage & Offline Capabilities
**Decision**: Hybrid approach — **Firebase Offline Persistence** (IndexedDB via Firestore SDK) + **LocalForage** for UI state (currentIndex, draft answers, pending submission flag).

- *Why not LocalStorage?* 5MB limit, synchronous/blocking, strings only.
- *Why Firebase Offline Persistence?* Automatically queues writes; syncs on reconnect without custom logic.
- *Why LocalForage?* Tracks exact UI state (timer offset, last question, pending submission) for hard-refresh / tab-close recovery.

### Syncing Strategy
Sync on **each answer selection** (not on submit). Firebase SDK queues writes when offline and flushes on reconnection — no manual batching required.

### Offline App Shell (PWA)
**Decision**: Adopt `vite-plugin-pwa` to cache the React App Shell (HTML/CSS/JS bundles) in the browser's Cache Storage.
- *What we are doing*: Generating and registering a Service Worker using `vite-plugin-pwa` with `registerType: 'autoUpdate'`.
- *How we are doing it*: Configured the Vite plugin in `vite.config.ts`. The Service Worker intercepts network requests. When the internet connection is lost and the user refreshes in production, it serves the cached `index.html` and assets instantly instead of showing the browser's default offline page (the Dinosaur game). This perfectly complements Firebase Offline Persistence which handles the data layer.

### Edge Case: Accidental Tab Close
**Decision**: Case 2 — **Direct Resume** (no re-login).
Firebase Auth persists the session natively. On reopen, the app reads `currentIndex` from LocalForage and drops the user exactly back on the last question they were viewing. The server-side timer continues ticking naturally.

### Edge Case: Offline Submission Recovery
When a user submits offline, a `pending_offline_submission` flag is saved to LocalForage. On next app launch (online), `App.tsx` runs a recovery check on startup. If found, it pushes the final answers to Firestore and shows a styled recovery message with proper padding instead of a plain alert.

### Malicious Cheating Analysis (Offline Mode Exploits)
1. **Time Freezing**: User goes offline, takes hours to answer, comes back online. → *Mitigation*: The `submittedAt` server timestamp is compared against `startTime + durationMinutes` by Firestore Security Rules. Late submissions are rejected.
2. **Clearing Cache to wipe tab violations**: User clears IndexedDB to remove `tabViolations`. → *Mitigation*: Wiping IndexedDB also erases their cached answers and `pending_offline_submission` flag, destroying their own progress.

---

## 2. Security: Test ID Validation (URL Manipulation Attack)

### Problem
Without validation, any user can craft an arbitrary URL like `/oa/any-made-up-id` and start a brand new test attempt with that ID. This is a significant security hole in production.

### Options Considered
- **Option A — Client-side allowlist**: Hardcode valid test IDs in `.env`. Simple but leaks IDs, requires redeployment for new tests.
- **Option B — Firestore `assessments` collection check**: On Lobby mount, verify the `testId` exists in `assessments/{testId}` before allowing the user to start. This is the correct production pattern.

### Decision: Option B (Firestore Verification)
**Implementation**: In `Lobby.tsx`, a `useEffect` runs on mount. It fetches `assessments/{testId}`. If the document doesn't exist, it sets an error state (`'invalid'`) and shows a "This assessment link is invalid." screen. If it exists, the Lobby renders normally.

**Demo Workaround**: A seed document `assessments/demo-test-id` is created in Firestore (via the Lobby itself, as a one-time creation if missing). This avoids requiring manual Firestore setup for the demo. In production, assessment documents would be created by administrators.

---

## 3. UI & Layout Design Decisions

### Theme
- **Brand name**: HackOff
- **Dark mode palette**: Deep navy/GitHub-style (`#0d1117` base, `#161b22` surface)
- **Accent color**: Purple (`#8b5cf6` in dark, `#7c3aed` in light) — changed from green to differentiate the brand while remaining professional.
- **Typography**: Inter (Google Fonts) for UI, JetBrains Mono for the timer.

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
4. **Firebase Auth session persistence on recovery**: The `pending_offline_submission` object in LocalForage contains `testId` but not `userId`. If a different user logs in on the same device, the recovery would push to the wrong user's Firestore document. **Fix**: The recovery check in `App.tsx` now also validates that `user.uid` matches the `userId` stored alongside the pending submission. Added `userId` to the stored object in `Assessment.tsx`.
5. **Firestore Security Rules**: `submittedAt` timestamp should be validated server-side to prevent late offline submissions. (Documented here; Firestore rules to be updated in production.)

---

## 5. Tech Stack Summary
- **Frontend**: React + Vite, TypeScript
- **Styling**: Vanilla CSS (CSS custom properties), Inter + JetBrains Mono fonts
- **Animations**: Framer Motion
- **Toasts**: Sonner
- **Backend/DB**: Firebase Authentication + Cloud Firestore (offline persistence enabled)
- **Hosting**: Firebase Hosting
