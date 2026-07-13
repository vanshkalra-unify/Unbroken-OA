# Online Assessment (OA) System Design & Developer Prompts

This document stores the design decisions, architectural reasoning, and AI prompts/answers for building the HackerRank-style Online Assessment app. It acts as a reference for your dev journey.

## 1. Initial Prompt from Developer
**Goal**: Build an Online Assessment web app with timed environments, various question types, robust offline support, Firebase backend, and secure execution.

## 2. Core Architecture Decisions

### Storage & Offline Capabilities
**Question**: Which browser storage is best for an OA app (IndexedDB, LocalStorage, Cache API)?
**Answer**: A **Hybrid approach** utilizing **Firebase's built-in IndexedDB persistence** alongside **LocalForage** is best. 
- *Why not LocalStorage?* It has a 5MB limit, is synchronous (blocking the main thread causing UI stutters), and only stores strings.
- *Why Firebase Offline Persistence?* It automatically caches fetched data in IndexedDB and queues outgoing writes. If the user answers while offline, the Firebase SDK queues the write and syncs it when the connection is restored, without custom complex sync logic.
- *Why LocalForage?* For tracking exact UI state (timer offset, selected question index) to survive hard-refreshes while offline.

### Syncing Strategy
**Question**: Should answers be saved in browser storage and synced on submit, or synced on each answer?
**Answer**: **Sync on each answer**. 
- Waiting until submission risks massive data loss if the browser crashes or clears cache. 
- By syncing on each answer, Firebase queues the writes. If offline, they are saved locally. 

### Edge Case: Accidental Tab Close during Test
**Question**: If a user accidentally closes the tab during a test, should we force them to login again (Case 1) or directly restore them to the last question they were on (Case 2)?
**Answer**: **Case 2 (Directly Restore State)**.
- Forcing a re-login during a timed, stressful test adds unnecessary friction and wastes valuable seconds. 
- Because Firebase Auth persists the session natively in the browser, we can detect the returning user instantly. 
- We track the `currentIndex` (last question viewed) in IndexedDB. When they reopen the tab, the app detects the in-progress attempt, reads the local cache, and drops them exactly back where they were. The timer naturally reflects the elapsed time server-side.

### Edge Case: Offline Submission Recovery
**Question**: If a user submits while offline, closes the tab, and reopens it later when online, how do we handle it?
**Answer**: 
- When they submit offline, we write a `pending_offline_submission = true` flag to IndexedDB.
- On the next app launch (when online), a global listener intercepts this flag. It pushes the final answers to Firestore and displays a custom success message: *"We noticed you completed the assessment while offline earlier. Your connection has been restored, and your test was successfully submitted to our servers just now."* This clearly differentiates it from a standard "Already submitted" error and validates the user's offline efforts.

### Malicious Cheating Analysis (Offline Mode Exploits)
**Question**: Could a user exploit the offline mode or tab-close recovery to cheat?
**Answer**: 
1. **Exploit: Time Freezing.** User turns off WiFi, takes 3 hours to solve, turns WiFi back on to trigger the "offline recovery submit". 
   - *Mitigation*: The `startTime` is securely recorded in Firestore when the test begins. When the offline submission eventually syncs to the backend, Firebase attaches a `serverTimestamp()`. The backend (via Firestore Security Rules) verifies that the `serverTimestamp()` of the submission minus `startTime` does not exceed the allowed duration. If they try to submit 3 hours late, the database rejects the write entirely, and their attempt is invalidated.
2. **Exploit: Clearing Tab Violations.** User turns off WiFi, switches tabs to Google answers, then clears browser cache/IndexedDB before turning WiFi back on to wipe the local `tabViolations` count.
   - *Mitigation*: If they clear their IndexedDB, they also wipe their cached `answers` and `pending_offline_submission` flag. They would lose all their progress. 

### Timer & Security (Anti-Cheating)
**Question**: How to make the app secure and handle the timer robustly?
**Answer**:
1. **Server-Side Timer**: Never trust the client clock. Record `startTime` in Firestore using a server timestamp. The client fetches this and calculates `endTime = startTime + allowed_duration`.
2. **Clock Skew Correction**: Calculate the difference between the user's local clock and the server clock to prevent users from manually changing their system time to get more time.
3. **Database Rules**: Use Firestore Security Rules to reject any answer payloads where the current server time is greater than the `endTime`.
4. **Environment Constraints**: 
   - Block right-click, copy, and paste.
   - Use the `Visibility API` to detect when the user switches tabs or minimizes the window, and log these violations.
   - Enforce Full-Screen mode during the test.

## 3. Data Model (Firestore)

- **`assessments`**: Stores OA configs (e.g., `id`, `title`, `durationMinutes`, `numberOfQuestions`).
- **`questions`**: The question bank (`id`, `type: mcq|multiselect|tf`, `text`, `options`, `correctAnswer`).
- **`attempts`**: The user's specific run (`id`, `userId`, `assessmentId`, `startTime`, `status`, `answers: map`, `tabSwitches: int`). Note: `correctAnswer` is NEVER sent to the client.

## 4. Tech Stack Summary
- **Frontend**: React.js via Vite.
- **Styling**: Tailwind CSS (Dark/Light mode, modern glassmorphism UI).
- **Backend/DB**: Firebase Authentication, Cloud Firestore.
- **Hosting**: Firebase Hosting.
