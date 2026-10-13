# 🌟 Aarsu: Enterprise Cognitive Agent & J.A.R.V.I.S. Command Core

[![AI Studio Build](https://img.shields.io/badge/Engine-Google%20Gemini%203.5%20%2F%203.8-blueviolet?style=for-the-badge&logo=google)](https://aistudio.google.com)
[![Architecture](https://img.shields.io/badge/Architecture-MCP%20Hub%20%2B%20Reinforcement%20Learning-blue?style=for-the-badge)](https://modelcontextprotocol.io)
[![Security](https://img.shields.io/badge/Security-Firebase%20Auth%20%2B%20OAuth%202.0-green?style=for-the-badge&logo=firebase)](https://firebase.google.com)
[![Build Status](https://img.shields.io/badge/Build-Passing%20(Vite%20%2B%20TypeScript)-success?style=for-the-badge)](https://vitejs.dev)

---

## 🧭 Executive Summary

**Aarsu** is an enterprise-grade, highly autonomous cognitive operating system and J.A.R.V.I.S. command core designed to synchronize human intent with multi-agent orchestration, proactive task scheduling, Model Context Protocol (MCP) integrations, reinforcement learning feedback loops, and hands-free voice execution. 

Built with **Google Gemini 3.5 / 3.8 Flash** and **Imagen 3.0**, Aarsu delivers real-time spatial computing, biometric HUD overlays, secure Firebase authentication, Google Workspace sync, and an immutable knowledge graph.

---

## 📊 System Architecture & Data Flow

```mermaid
graph TD
    subgraph Client Tier [Spatial UI & Voice Engine]
        UI[React + Tailwind HUD] --> Hotkey[Global Hotkey Engine (Ctrl+Space)]
        Hotkey --> STT[Continuous Web Speech STT]
        STT --> Audio[Jarvis Audio Synthesizer]
    end

    subgraph Gateway Tier [Express Enterprise Gateway]
        Gateway[Express Server.ts] --> Auth[Firebase Token & OAuth Verifier]
        Gateway --> Rate[Rate Limiter & Helmet Security]
    end

    subgraph Intelligence Core [Google GenAI SDK]
        Auth --> Gemini[Gemini 3.5 / 3.8 Flash]
        Auth --> Imagen[Imagen 3.0 Visual Synthesizer]
        Gemini --> MCP[MCP Hub (GitHub, Slack, Filesystem)]
        Gemini --> RL[Reinforcement Learning Feedback Loop]
    end

    subgraph Persistence & Sync Tier
        Gemini --> DB[(PostgreSQL / Cloud SQL + Firestore)]
        Gemini --> Graph[Knowledge Graph & Redis Cache]
        Gemini --> Daemon[Proactive Calendar & Email Daemon]
    end
```

---

## 📈 Infographic: Core Capabilities Matrix

```
+-------------------------------------------------------------------------------------------------+
|                                 AARSU COGNITIVE ENGINE V3.0                                     |
+---------------------------------+-------------------------------+-------------------------------+
| 🎙️ Hands-Free Voice Control     | 🧠 Reinforcement Learning     | 🔌 Modular MCP Hub            |
| • Global Hotkey (Ctrl + Space)  | • Policy Reward Optimization  | • GitHub, Slack, Filesystem   |
| • Always-on STT & Wake Word     | • User Feedback Reward Tuning | • Enterprise Connection Mgr   |
| • Jarvis Arc Pulse Audio FX     | • Automated Agent Adaptation  | • Secure Sandbox Isolation    |
+---------------------------------+-------------------------------+-------------------------------+
| 📅 Proactive Daemon             | 🛡️ Enterprise Security       | 🖼️ Real-Time 3D Vision        |
| • Calendar & Email Parsing      | • Firebase Auth + ID Tokens   | • Imagen 3.0 Photo Generation |
| • Pre-Meeting Brief Generator   | • RBAC & Encrypted Vault      | • Spatial HUD Holographic UI  |
| • Autonomous Task Scheduling    | • OAuth 2.0 Google Workspace  | • Multi-Modal Embeddings      |
+---------------------------------+-------------------------------+-------------------------------+
```

---

## 📋 Feature Comparison Table

| Feature Capability | Traditional Assistants | Aarsu Cognitive Core (J.A.R.V.I.S.) |
| :--- | :--- | :--- |
| **Trigger Mechanism** | Manual mouse click / button tap | Global Hotkey (`Ctrl + Space`) & Wake Word detection |
| **Model Backend** | Static prompts, single-turn | Multi-model Gemini 3.5/3.8 Flash with automatic fallback |
| **Context Integration** | Isolated local history | Immutable Knowledge Graph & Redis Caching |
| **Proactive Intelligence** | Reactive query-response | Autonomous daemon scanning calendar & emails for prep |
| **External Integrations** | Hardcoded API keys | Model Context Protocol (MCP) modular bridge |
| **Voice Feedback** | Standard browser speech | Spatial arc pulse audio & emotional viseme synchronization |
| **Security & Auth** | Basic session cookies | Firebase ID tokens + Google Workspace OAuth 2.0 |

---

## 🛠️ Technical Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Canvas 3D Particle HUD.
- **Backend**: Node.js, Express, TypeScript, `@google/genai` (Gemini 3.5/3.8 Flash, Imagen 3.0).
- **Security**: Helmet, Express Rate Limit, Firebase Authentication, OAuth 2.0 Bearer tokens.
- **Intelligence**: Reinforcement learning feedback loop, MCP connector daemons, Knowledge Graph vector embeddings.

---

## 🔌 Model Context Protocol (MCP) Hub

Aarsu implements a robust MCP architecture allowing seamless connection to external developer tools and data silos:

1. **GitHub MCP**: Autonomous repository inspection, issue tracking, and PR summarization.
2. **Slack MCP**: Real-time channel message parsing, triage, and automated replies.
3. **Local Filesystem MCP**: Secure directory indexing, code search, and file manipulation.

---

## 🚀 Quick Start & Installation

1. **Clone and Install Dependencies**:
   ```bash
   git clone https://github.com/aarsu/aarsu-cognitive-core.git
   cd aarsu-cognitive-core
   npm install
   ```

2. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY=your_google_genai_api_key_here
   PORT=3000
   NODE_ENV=development
   SIMULATION_MODE=true
   ENABLE_VOICE=true
   ENABLE_WORKSPACE=true
   ```

### Simulation Mode

`SIMULATION_MODE` is enabled by default. In this mode, IoT controls, biometric telemetry, the knowledge graph, and Redis-like cache are simulated/in-memory unless replaced with real adapters/services.

3. **Run Development Server**:
   ```bash
   npm run dev
   ```

4. **Production Build**:
   ```bash
   npm run build
   npm start
   ```

---

## 📜 API Endpoints Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | System health check and uptime monitor |
| `/api/chat` | `POST` | Primary cognitive generation with Gemini 3.5/3.8 flash |
| `/api/image/generate` | `POST` | High-fidelity 3D realistic image generation via Imagen 3.0 |
| `/api/mcp/connect` | `POST` | Establish MCP bridge to GitHub, Slack, or Filesystem |
| `/api/reinforcement/reward` | `POST` | Submit reward feedback for reinforcement learning loop |

---

## 📄 License

Licensed under the MIT License. Built with ❤️ for enterprise cognitive excellence.
