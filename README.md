# Aarsu AI: Technical Architecture, Operational Workflow & System Specification

A comprehensive technical breakdown and architectural specification of **Aarsu**, an expressive, multimodal, real-time interactive digital companion.

---

## 1. System Architecture Overview

```
 +-----------------------------------------------------------------------------------------+
 |                                    CLIENT LAYER (Browser)                               |
 |                                                                                         |
 |  +--------------------+   +-----------------------+   +------------------------------+  |
 |  |  Vision Sensor     |   | Audio / Speech Engine |   |  Visual Avatar Stage         |  |
 |  |  - HTML5 Canvas    |   | - Web Speech API (STT)|   |  - 2.5D Parallax Canvas      |  |
 |  |  - WebRTC Webcam   |   | - SpeechSynthesis TTS |   |  - Anatomical LipSync Viseme |  |
 |  |  - Image Downscaler|   | - Boundary Viseme Bus |   |  - MicroExpression Engine    |  |
 |  +---------+----------+   +-----------+-----------+   +--------------^---------------+  |
 |            |                          |                              |                  |
 |            | Base64 Frame             | Text + Auth Token            | Visemes & State  |
 |            v                          v                              |                  |
 |  +------------------------------------+------------------------------+---------------+  |
 |  |                          Chat & Orchestration Controller                          |  |
 |  |   - Ephemeral UI State                 - Micro-Expression Dispatcher              |  |
 |  |   - Workspace Identity Integration      - Long-term Memory Vector Cache           |  |
 |  +------------------------------------+----------------------------------------------+  |
 +---------------------------------------|-------------------------------------------------+
                                         | Secure POST /api/chat (Bearer Token)
                                         v
 +-----------------------------------------------------------------------------------------+
 |                                  BACKEND GATEWAY (Node.js)                              |
 |                                                                                         |
 |  +------------------------------------+----------------------------------------------+  |
 |  | Request Sanitization & Rate Guard  |  Workspace OAuth & Token Validation          |  |
 |  +------------------------------------+----------------------------------------------+  |
 |                                       |                                                 |
 |  +------------------------------------+----------------------------------------------+  |
 |  | Memory Retrieval Pipe (Firestore) |  Model Resilience & Failover Router          |  |
 |  | - User Vector History Context      |  - Primary: gemini-3.1-flash-lite            |  |
 |  | - Personal Fact Extraction         |  - Backup 1: gemini-3.8-flash                |  |
 |  |                                    |  - Backup 2: gemini-flash-latest             |  |
 |  +------------------------------------+----------------------------------------------+  |
 +---------------------------------------|-------------------------------------------------+
                                         | Multimodal Ingestion (Text, Memory, Image)
                                         v
 +-----------------------------------------------------------------------------------------+
 |                                  GOOGLE GEMINI ENGINE                                   |
 |                                                                                         |
 |  - High-Efficiency Multimodal Reasoning                                                 |
 |  - Structured JSON Schema Output (`reply`, `emotion`, `workspaceAction`)               |
 |  - Grounded Conversational Context & Visual Perception                                  |
 +-----------------------------------------------------------------------------------------+
```

---

## 2. Interactive Operational Workflow

The following diagram illustrates how multimodal user input flows through ingestion, processing, failover resilience, and real-time avatar synthesis:

```
[User Input]          [Client Stage]               [Express Server]             [Gemini / Cloud Engine]
     |                      |                             |                                |
     |-- Spoken / Typed --->|                             |                                |
     |   Query              |-- Capture Camera Frame ---->|                                |
     |                      |   (If Vision Active)        |                                |
     |                      |                             |-- Query Persistent Memory ---->| (Firestore)
     |                      |                             |   Context & History            |<-- Context
     |                      |                             |                                |
     |                      |                             |-- Dispatches Prompt + Image -->|
     |                      |                             |   (gemini-3.1-flash-lite)      |
     |                      |                             |                                |
     |                      |                             |   [If 503 Spike or 429 Quota]  |
     |                      |                             |== Immediate Failover Router ==>|
     |                      |                             |   (gemini-3.8-flash / Backup)  |
     |                      |                             |                                |
     |                      |<-- Structured JSON Payload -|<-- Validated JSON Response ----|
     |                      |    { reply, emotion }       |                                |
     |                      |                             |                                |
     |                      |-- Parse Emotion Tone        |                                |
     |                      |   (happiness/curiosity/etc) |                                |
     |                      |                             |                                |
     |                      |-- Synthesize Speech (TTS)   |                                |
     |                      |-- Stream Viseme Lip Sync    |                                |
     |                      |-- Trigger Micro-Expressions |                                |
     |<-- Natural Audio ----|   (Eye Widening / Brow Furr)|                                |
     |<-- Living Avatar ----|                             |                                |
```

---

## 3. Core Component Specifications

```
========================================================================================
MODULE                  KEY TECHNOLOGIES                OPERATIONAL ROLE
========================================================================================
Avatar Visual Stage     Canvas 2D, CSS 3D Transforms,  Renders 2.5D head tracking, depth
                        Lucide React                   parallax, blinking, sunbeam dust,
                                                       and facial emotion shifts.

HumanLipSync Engine     SVG Bézier Path Interpolation  Transforms phoneme stream into
                        60fps Motion Smoothing         anatomical mouth movements (teeth,
                                                       tongue, oral cavity, vermilion).

Micro-Expression Layer  Bilateral Anatomical Anchors,  Simulates non-verbal realism during
                        Subtle Alpha Shading           conversational pauses (eye-widening,
                                                       glabellar brow furrows, crinkles).

Vision Pipeline         WebRTC getUserMedia API,       Captures downscaled ambient frames
                        Offscreen 2D Canvas            without latency overhead for live
                                                       scene and user perception.

Resilience Gateway      Express, Node.js,              Automates cascade routing across
                        @google/genai SDK              models to prevent 503/429 downtime.

Memory & Persistence    Firebase Firestore,            Stores interaction history, user facts,
                        Google Identity Services       and personal context across sessions.
========================================================================================
```

---

## 4. Multimodal & Visual Engineering Details

### Micro-Expression Subsystem
To overcome the "uncanny valley" of static avatars, Aarsu operates a continuous state machine for non-verbal cues:
- **Pause Detection:** When speech boundaries (`sentence` events) or user input halts occur, a momentary pause trigger evaluates the emotional state.
- **Eye-Widening:** Accentuates pupil specular highlights and slightly lifts the upper eyelid crease to signify sudden comprehension or engagement.
- **Brow-Furrowing:** Applies a soft vertical glabellar crease and depresses the inner medial eyebrows (`depressor supercilii`) to convey active listening or consideration.
- **Duchenne Crinkle:** Elevates the lower eyelid cushion (`orbicularis oculi`) during positive emotional states (happiness, empathy).
- **Fleeting Duration:** Each micro-expression holds for 600ms–1400ms before returning to equilibrium, matching natural human micro-facial kinetics.

### Vision Processing Flow
1. **Permission Check:** Verified via browser permissions and declared in `metadata.json`.
2. **Snapshot Capture:** Live frames are rendered to an offscreen canvas at constrained dimensions (640×480) with JPEG compression to minimize upload payload size.
3. **Multimodal Packaging:** The base64 payload is injected alongside the user's prompt into the unified Gemini content buffer.
4. **Contextual Awareness:** Gemini receives instructions to treat the image as direct eyesight, enabling natural remarks about room lighting, clothing color, held objects, and expressions.

---

## 5. Reliability & Failover Strategy

```
                          [ Incoming Request ]
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │     Primary Engine:           │
                   │  gemini-3.1-flash-lite        │
                   └───────────────┬───────────────┘
                                   │
                       Success? ───┴───► [ Return 200 OK ]
                                   │ No (503 / 429)
                                   ▼
                   ┌───────────────────────────────┐
                   │     Secondary Fallback:       │
                   │  gemini-3.8-flash             │
                   └───────────────┬───────────────┘
                                   │
                       Success? ───┴───► [ Return 200 OK ]
                                   │ No (503 / 429)
                                   ▼
                   ┌───────────────────────────────┐
                   │     Tertiary Failover:        │
                   │  gemini-flash-latest          │
                   └───────────────┬───────────────┘
                                   │
                       Success? ───┴───► [ Return 200 OK ]
                                   │ No
                                   ▼
                   ┌───────────────────────────────┐
                   │     Empathetic Static Guard:  │
                   │  Returns friendly recovery    │
                   │  message without crashing     │
                   └───────────────────────────────┘
```

---

## 6. Performance & Operational Characteristics

| Metric / Dimension | Real-World Behavior | Engineering Solution |
| :--- | :--- | :--- |
| **First Token Latency** | 450ms – 900ms via `gemini-3.1-flash-lite` | Single-turn streaming payload; fast token generation. |
| **Speech Generation** | Client-side native TTS (`window.speechSynthesis`) | Zero roundtrip audio latency; instant playback with zero bandwidth cost. |
| **Lip-Sync Accuracy** | Heuristic viseme mapping driven by speech events | Phoneme-boundary smoothing eliminates mechanical jitter. |
| **Vision Bandwidth** | ~40–70 KB per query snapshot | Low-overhead capture only on user prompts; avoids video-streaming drain. |
| **Rate Limit Protection** | Automated tier cascading | Instant non-blocking model failover prevents 503 high-demand halts. |
