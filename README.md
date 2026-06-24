# omniAgent

> Your personal AI Agent — omni-capable, locally running, built for developers who think in systems.

[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5.10-green.svg)](https://spring.io/projects/spring-boot)
[![Spring AI](https://img.shields.io/badge/Spring%20AI-1.1.3-blue.svg)](https://spring.io/projects/spring-ai)
[![Java](https://img.shields.io/badge/Java-21-orange.svg)](https://www.oracle.com/java/)
[![React](https://img.shields.io/badge/React-18-cyan.svg)](https://react.dev/)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **[中文文档](README.zh.md)**

**omniAgent** is a personal AI Agent powered by Spring Boot + Spring AI. It combines code understanding, document intelligence, semantic search, multi-vendor LLM support, and an extensible skill/tool system into a single intelligent assistant that runs entirely on your local machine.

---

## Features

| Category | Capabilities |
|----------|-------------|
| **Code Intelligence** | Read, write, edit, grep, glob files; execute shell commands with security validation |
| **Multi-Vendor LLM** | Pluggable strategy pattern — DeepSeek, MiniMax (M2.7), Anthropic Claude (proxied) |
| **Document Processing** | PDF, Word (DOCX), Markdown, TXT parsing via Apache Tika |
| **RAG Knowledge Base** | Vector embeddings (BAAI/bge-m3, 1024d) + pgvector similarity search + rerank |
| **Recursive Chunking** | Token-aware parent-child splitting (800/200 tokens) with structure awareness |
| **Skill System** | Hot-pluggable skills via SKILL.md, auto-discovered at runtime |
| **Sub-Agent System** | Fork agents with tool filtering, worktree isolation, session management |
| **Streaming Chat** | Real-time SSE with thought/tool-call/text block rendering |
| **Conversation Interrupt** | True backend LLM cancellation via AbortController + WebFlux |
| **Native Folder Picker** | JavaFX DirectoryChooser for full absolute path selection |

---

## Quick Start

### Prerequisites

| Dependency | Version |
|-----------|---------|
| Java | 21+ |
| MySQL | 8.0+ |
| PostgreSQL | 15+ (with pgvector) |
| Maven | 3.9+ |
| Node.js | 18+ (frontend) |

### Setup

```bash
# 1. Clone
git clone https://github.com/LainXXX/omniAgent.git
cd omniAgent

# 2. Create databases
# MySQL: create database rem-agent
# PostgreSQL: create database springai with pgvector extension

# 3. Configure AI providers
# Edit src/main/resources/application-dev.yml with your API keys

# 4. Start backend (port 9090)
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# 5. Start frontend dev server (port 9500)
cd frontend
npm install
npm run dev
```

Open `http://localhost:9500` to start chatting.

---

## Architecture

### System Overview

```
┌─────────────┐     ┌──────────────────────────────────────────────────┐
│  React SPA  │     │             Spring Boot Backend                 │
│  :9500      │     │             :9090                               │
│             │     │                                                  │
│  ChatInput  │◄───►│  ChatController → ChatService                    │
│  ChatMessage│ SSE │       → ChatModelStrategyFactory                 │
│  Sidebar    │     │         ├── DeepSeekChatStrategy                 │
│  ToolsSide  │     │         ├── MiniMaxChatStrategy                  │
│  Question   │     │         └── AnthropicChatStrategy                │
│  Inline     │     │                                                  │
│             │     │  Advisor Chain                                   │
│  Knowledge  │     │    MessageFormat (order: 10000)                  │
│  Base Panel │     │    ContextCompression (order: 4000)              │
│             │     │    LifecycleToolCall (order: MAX-1)              │
│             │     │    TaskProgress (order: MAX-100)                 │
└─────────────┘     │                                                  │
                    │  Tools: File │ Web │ RAG │ Bash │ Skill │ Agent  │
                    │                                                  │
                    │  MySQL (chat history)                             │
                    │  PostgreSQL + pgvector (embeddings)               │
                    └──────────────────────────────────────────────────┘
```

### Advisor Chain Flow

```
Request → MessageFormatAdvisor.before()
       → LifecycleToolCallAdvisor.doInitializeLoopStream()
       → Tool Call Loop
       → ChatClientMessageAggregator
       → LifecycleToolCallAdvisor.doFinalizeLoopStream()
       → MessageFormatAdvisor.after()
       → Response
```

### SSE Streaming Protocol

```
data:{"id":"...","choices":[{"delta":{"content":"...","reasoning_content":"...","tool_calls":[...]},"finish_reason":"tool_calls"}]}
data:[DONE]
```

- Format: OpenAI-Compatible delta chunks
- Events: `text`, `thought`, `tool-call`, `round-end`, `dangerous-command`

---

## Project Structure

### Backend (`src/main/java/top/javarem/omni/`)

```
├── controller/
│   ├── ChatController.java           # SSE streaming chat
│   ├── AskUserQuestionController.java # Question polling
│   ├── ApprovalController.java       # Command approval + SSE push
│   ├── KnowledgeBaseController.java  # KB CRUD + search
│   ├── PetController.java            # Pet management demo
│   └── WorkspaceController.java      # JavaFX folder picker
├── service/
│   ├── ChatService.java              # Chat orchestration
│   ├── AskUserQuestionService.java   # Question flow
│   └── rag/ (ETL, chunking, tokenizer)
├── strategy/                         # LLM multi-vendor
│   ├── ChatModelStrategy.java        # Interface
│   ├── ChatModelStrategyFactory.java # Registry
│   ├── DeepSeekChatStrategy.java
│   ├── MiniMaxChatStrategy.java
│   ├── AnthropicChatStrategy.java
│   └── SseChunkEncoder.java
├── advisors/ (4 advisors)
├── tool/ (file, web, rag, bash, agent, tools)
├── repository/ (chat + rag)
├── model/
├── config/ (AI, CORS, Web, ThreadPool, RAG, Skill)
├── loader/ (SkillLoader, SystemMessageLoader)
└── Application.java
```

### Frontend (`frontend/src/`)

```
├── App.tsx                    # Main chat page
├── main.tsx                   # Entry + Router
├── index.css                  # Tailwind v4
├── api/ (chat, knowledgeBase, pet, rag)
├── components/ (12 components)
│   ├── ChatInput.tsx          # Textarea + workspace picker
│   ├── ChatMessage.tsx        # Block-rendered messages
│   ├── QuestionInline.tsx     # Multi-step question form
│   ├── CommandApprovalInline.tsx
│   ├── KnowledgeBasePanel.tsx
│   ├── Sidebar.tsx
│   ├── ToolsSidebar.tsx
│   └── ...
├── types/index.ts
└── utils/messageParser.ts
```

---

## Configuration

### AI Vendors

| Vendor | Model | Role |
|--------|-------|------|
| DeepSeek | `deepseek-v4-flash` | Default chat (OpenAI-compatible) |
| MiniMax | `MiniMax-M2.7` | Alternative chat |
| Anthropic | `MiniMax-M2.7` (proxied) | Alternative via MiniMax proxy |
| Embedding | `BAAI/bge-m3` (1024d) | Vector embeddings |
| Rerank | `BAAI/bge-reranker-v2-m3` | Search re-ranking |

### Databases

| Database | Purpose | Connection |
|----------|---------|-----------|
| MySQL `rem-agent` | Chat history | `localhost:3306` |
| PostgreSQL `springai` | Vectors (pgvector) | `localhost:5432` |

---

## Development

```bash
# Backend
./mvnw compile                             # Fast check
./mvnw test                                # Tests
./mvnw spring-boot:run                     # Start dev server

# Frontend
cd frontend
npm run dev                                # Vite :9500
npm run build                              # Production
npm run test                               # Vitest
```

### Key Design Decisions

- **Advisor Chain**: Spring AI pipeline, ordered by `getOrder()`
- **Multi-Vendor**: Strategy pattern, vendor selected per request via `vendor` field
- **Tool Discovery**: `ToolsManager` auto-scans all `AgentTool` beans
- **Skill Discovery**: Scans `~/.omni/skills/**/SKILL.md` at runtime
- **Workspace Picker**: JavaFX `DirectoryChooser` for native Windows dialog
- **Streaming Abort**: `AbortController` → `fetch` cancel → `Flux` cancellation
- **Processing Time**: `performance.now()` per assistant message
- **Auth**: Removed entirely — single-user local application

---

## License

MIT License © 2025-2026 LainXXX

GitHub: [https://github.com/LainXXX](https://github.com/LainXXX)
