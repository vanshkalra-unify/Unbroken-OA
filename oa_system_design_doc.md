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
- *Edge Case (Offline Submission)*: If the user submits while offline, we set a `submit_pending` flag locally. The UI shows a reassuring message ("You are offline, answers saved. Reconnecting..."). We listen to the `online` event to push the final submission.

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
