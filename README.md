# HackOff: Architecture & Scaling Whitepaper

## 1. Executive Summary
HackOff is a modern, high-performance Online Assessment (OA) platform designed for engineering hiring. Built on a serverless architecture using React 19, Vite, Vercel, and Firebase, it delivers a zero-latency, offline-resilient experience for candidates while enforcing impenetrable server-side security to prevent tampering. 

## 2. The Unique Selling Proposition (USP)
Traditional assessment platforms suffer from a binary flaw: they either **crash entirely** when a candidate's internet flickers, or they use "Offline-First" trusting mechanisms that allow sophisticated users to **pause JavaScript and cheat the timer**.

HackOff's USP is its **Hybrid Resilience Architecture**:
1. **Zero-Latency Candidate UX**: Candidates never see loading spinners when answering questions. The UI updates instantly via local state.
2. **Graceful Offline Degradation**: If the internet drops, the UI does not freeze. Candidates can continue answering questions, and the system queues their actions locally.
3. **Cryptographic Strict-Time Enforcement**: We do not trust the client. The frontend offline cache handles the UX, but Google's Firestore Security Rules actively evaluate the exact millisecond packets arrive. If a user tries to submit offline answers *after* the time limit has expired, the server violently rejects the late answers while gracefully accepting the test submission to prevent the user from being stuck. 

This guarantees candidate peace of mind without compromising an ounce of institutional security.

---

## 3. Deep Dive: Browser-Based Offline Storage Strategy

Because a primary goal of this project was to master client-side offline storage APIs, HackOff heavily utilizes three distinct browser storage mechanisms to achieve its seamless offline experience:

### 3.1. Cache Storage API (The App Shell)
- **Technology**: `vite-plugin-pwa` generating a Service Worker.
- **Purpose**: To cache all HTML, CSS, JavaScript, and font assets.
- **How it works**: When the user first visits the site, the Service Worker downloads the core application bundle into the browser's Cache Storage. If the user loses internet and accidentally refreshes the page, the Service Worker intercepts the network request and instantly serves the cached files. This prevents the browser from showing the default "No Internet" dinosaur game and keeps the app functional.

### 3.2. LocalForage & IndexedDB (The UI State)
- **Technology**: `localforage` library wrapping the native `IndexedDB` API.
- **Purpose**: To persistently track the exact UI state of the assessment.
- **How it works**: LocalForage creates an IndexedDB database named `OnlineAssessmentApp` with an object store named `oa_state`. We use this instead of `localStorage` because it is asynchronous (non-blocking) and can store complex objects. 
- **Stored Keys**:
  - `current_questions`: The randomized array of questions for this session.
  - `current_index`: The question number the user is currently viewing.
  - `answers`: The draft selections made by the user.
  - `attempt_start_time` & `attempt_duration`: The exact timestamp the test started. If the user refreshes offline, the app reads this from `oa_state` to ensure the timer continues accurately without resetting.
  - `pending_offline_submission`: A boolean flag that locks the UI if the user submits the test while offline, preventing further interaction upon refresh.

### 3.3. Firebase Offline Persistence (The Data Queue)
- **Technology**: Cloud Firestore SDK with `enableIndexedDbPersistence`.
- **Purpose**: To handle the actual transport of data to the server without manual fetch queues.
- **How it works**: The Firebase SDK creates its own hidden IndexedDB tables. When the user clicks an answer while offline, we simply call `updateDoc()`. The SDK automatically intercepts this, writes the payload to its local IndexedDB queue, and pauses. The moment the `window.ononline` event fires, the SDK sequentially flushes this queue to Google's servers.

---

## 4. System Architecture & Design

### 4.1. Frontend Architecture
- **Framework**: React 19 + Vite 8.
- **State Management**: React state handles immediate interactions, seamlessly backed by the multi-layered storage strategy outlined in Section 3.

### 4.2. Data Transport Layer
- **Auto-Syncing**: Handled entirely by Firebase's native IndexedDB queue. No custom `fetch` retry logic is necessary.

### 4.3. Backend: Security & Database (Firestore)
- **Database Structure**:
  - `/assessments/{testId}`: Contains test metadata (duration, title). Read-only for candidates.
  - `/attempts/{attemptId}`: Contains live candidate sessions.
- **Impenetrable Security Rules**: 
  Instead of relying on the frontend to freeze the test, the backend enforces the time limit:
  ```javascript
  // Server-Side Rule
  request.time <= resource.data.startTime + duration.value(resource.data.durationMinutes + 1, 'm')
  ```
  This rule evaluates the physical timestamp the packet hits Google's servers. Late packets are denied at the network layer.

### 4.4. UI / UX Design System
- **Theme**: "Interstellar Black & White" — a premium, Vercel-inspired monochromatic aesthetic. Pure blacks (`#000000`), deep greys (`#0a0a0a`), and stark white text.
- **Glassmorphism**: Modals and top-bars use backdrop-blur filters for depth.
- **Fluid Responsiveness**: Standardized CSS variables and clamp-based sizing ensures perfect rendering on mobile devices without layout shift.

---

## 5. Key Features Implemented
1. **Live Offline Recovery**: Candidates can answer questions offline, submit the test offline, and close the tab. The app will auto-sync their exact state the moment they reopen it with an internet connection.
2. **Refresh Bypass Prevention**: Hard-refreshing the browser while offline reads the encrypted local storage state, immediately locking the UI if the test was already submitted.
3. **Tab Violation Tracking**: The system detects `document.hidden` events. If a candidate switches tabs to Google an answer, a background worker increments a `tabViolations` counter directly in the database.
4. **URL Manipulation Protection**: The Lobby strictly verifies the `{testId}` parameter against the `assessments` collection before allowing a test to start, preventing users from spoofing IDs to reset their timer.

---

## 6. Scaling HackOff: The Road to 1M+ Candidates

To evolve HackOff from a lightweight OA platform to an enterprise-grade recruiting tool, the following architectural scaling paths should be taken:

### 6.1. Database Sharding & Tenancy (Data Layer Scaling)
Currently, all attempts live in a single `/attempts` root collection. For B2B enterprise scaling (multiple companies using the platform):
- **Implementation**: Shift to a Multi-Tenant architecture: `/organizations/{orgId}/assessments/{testId}/attempts/{attemptId}`.
- **Benefit**: This allows strict IAM rule partitioning per organization and prevents Firestore index hotspots during massive simultaneous campus hiring drives.

### 6.2. Isolated Remote Code Execution (RCE)
To support actual programming questions (Python, C++, Java):
- **Implementation**: Deploy an isolated **Kubernetes (GKE) Cluster** running heavily sandboxed Docker containers (e.g., using Google's `gVisor`). 
- **Architecture**: The frontend establishes a `WebSocket` connection to a Go-based load balancer, which spins up a temporary container, executes the candidate's code against hidden test cases, returns stdout/stderr, and destroys the container within 500ms.

### 6.3. Dynamic Question Banks & Elo Ranking
Currently, questions are statically served. To prevent question leaking on forums (like LeetCode discussions):
- **Implementation**: Build a massive pool of questions. Implement an **Item Response Theory (IRT)** or Elo-based rating system.
- **Benefit**: The platform dynamically generates a unique test for every candidate of equal difficulty. If a candidate answers a hard question correctly, their next question adapts to be harder (Computer Adaptive Testing).

### 6.4. Advanced WebRTC Proctoring
To reach university-grade exam security:
- **Implementation**: Integrate WebRTC for live audio/video streaming. 
- **AI Processing**: Feed the stream through a lightweight TensorFlow.js model in the browser (or a backend processing pipeline) to detect multiple faces, absence from the camera, or mobile phones in the frame.
- **Benefit**: Enhances the existing `tabViolations` metric into a comprehensive "Trust Score" for the recruiter.
