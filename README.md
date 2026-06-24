# omniAgent

> Your personal AI Agent — omni-capable, locally running, built for developers who think in systems.

[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5.10-green.svg)](https://spring.io/projects/spring-boot)
[![Spring AI](https://img.shields.io/badge/Spring%20AI-1.1.3-blue.svg)](https://spring.io/projects/spring-ai)
[![Java](https://img.shields.io/badge/Java-21-orange.svg)](https://www.oracle.com/java/)
[![React](https://img.shields.io/badge/React-18-cyan.svg)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**omniAgent** is a personal AI Agent powered by Spring Boot + Spring AI. It combines code understanding, document intelligence, semantic search, multi-vendor LLM support, and an extensible skill/tool system into a single intelligent assistant that runs entirely on your local machine.

---

## Features

| Category | Capabilities |
|----------|-------------|
| **Code Intelligence** | Read, write, edit, grep, glob files; execute shell commands with security validation |
| **Multi-Vendor LLM** | Pluggable strategy pattern — DeepSeek, MiniMax (M2.7), Anthropic Claude proxied via MiniMax |
| **Document Processing** | PDF, Word (DOCX), Markdown, TXT parsing with Apache Tika |
| **RAG Knowledge Base** | Vector embedding (BAAI/bge-m3, 1024d) + pgvector similarity search + Rerank re-ranking |
| **Recursive Chunking** | Token-aware parent-child splitting (800/200 tokens) with structure awareness |
| **Skill System** | Hot-pluggable skills via SKILL.md files, auto-discovered at runtime |
| **Sub-Agent System** | Fork agents with tool filtering, worktree isolation, session management |
| **Web Capabilities** | Web search + content fetch, real-time internet information retrieval |
| **Streaming Chat** | Real-time SSE streaming with thought/tool-call/text block rendering |
| **Conversation Interrupt** | True backend LLM cancellation via AbortController + WebFlux Flux cancellation |

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

# 2. Configure databases
# MySQL: create database rem-agent
# PostgreSQL: create database springai with pgvector extension

# 3. Configure AI providers
# Edit src/main/resources/application-dev.yml with your API keys

# 4. Start backend (port 9090)
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# 5. Start frontend dev server (port 9500, in another terminal)
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
│  React SPA  │     │             Spring Boot Backend                  │
│  :9500      │     │             :9090                                │
│             │     │                                                  │
│  App.tsx    │◄───►│  ChatController → ChatService                    │
│  ChatInput  │ SSE │       → ChatModelStrategyFactory                 │
│  ChatMessage│     │         ├── DeepSeekChatStrategy                 │
│  Sidebar    │     │         ├── MiniMaxChatStrategy                  │
│  ToolsSide  │     │         └── AnthropicChatStrategy                │
│             │     │                                                  │
│  Knowledge  │     │  Advisor Chain Pipeline                          │
│  Base Panel│     │    MessageFormatAdvisor (order: 10000)            │
│             │     │    ContextCompressionAdvisor (order: 4000)       │
│  Question   │     │    LifecycleToolCallAdvisor (order: MAX-1)       │
│  Inline     │     │    TaskProgressAdvisor (order: MAX-100)          │
└─────────────┘     │                                                  │
                    │  Tool System                                     │
                    │    File Tools │ Web Tools │ RAG Tool             │
                    │    Bash Tool │ Skill Tool │ Agent Tool           │
                    │    AskUserQuestionTool │ Task Tool               │
                    │                                                  │
                    │  Data Stores                                      │
                    │    MySQL (chat history)                           │
                    │    PostgreSQL + pgvector (embeddings)             │
                    └──────────────────────────────────────────────────┘
```

### Advisor Chain Flow

```
Request → MessageFormatAdvisor.before()
       → LifecycleToolCallAdvisor.doInitializeLoopStream()
       → Tool Call Loop (doGetNextInstructionsForToolCallStream)
       → ChatClientMessageAggregator.aggregateChatClientResponse()
       → LifecycleToolCallAdvisor.doFinalizeLoopStream()
       → MessageFormatAdvisor.after()
       → Response
```

### SSE Streaming Protocol

```
data:{"id":"...","choices":[{"delta":{"content":"...","reasoning_content":"...","tool_calls":[...]},"finish_reason":"tool_calls"}]}
data:[DONE]
```

- Backend sends OpenAI-Compatible delta chunks
- Frontend `streamChat()` parses `data:` lines, yields `StreamEvent` objects
- Events: `text`, `thought`, `tool-call`, `round-end`, `dangerous-command`

---

## Project Structure

### Backend (`src/main/java/top/javarem/omni/`)

```
├── controller/
│   ├── ChatController.java          # SSE streaming chat endpoint
│   ├── AskUserQuestionController.java # Question polling & answering
│   ├── ApprovalController.java       # Dangerous command approval + SSE push
│   ├── KnowledgeBaseController.java  # KB CRUD + search
│   ├── PetController.java            # Pet management demo
│   └── WorkspaceController.java      # JavaFX folder picker dialog
├── service/
│   ├── ChatService.java              # Chat orchestration, multi-vendor dispatch
│   ├── AskUserQuestionService.java   # Question flow management
│   └── rag/
│       ├── AdvancedRagEtlService.java # ETL pipeline
│       ├── RecursiveTextSplitter.java # Token-aware chunking
│       ├── MarkdownHeaderSplitter.java # Markdown-aware splitting
│       └── TokenCounter.java         # JTokkit-based counting
├── strategy/                         # LLM multi-vendor adapter
│   ├── ChatModelStrategy.java        # Interface
│   ├── ChatModelStrategyFactory.java # Strategy registry
│   ├── DeepSeekChatStrategy.java     # OpenAI-compatible
│   ├── MiniMaxChatStrategy.java      # MiniMax native
│   ├── AnthropicChatStrategy.java    # Anthropic Messages API
│   └── SseChunkEncoder.java          # Unified chunk serialization
├── advisors/
│   ├── MessageFormatAdvisor.java     # System prompt + skill injection
│   ├── ContextCompressionAdvisor.java # Head+tail+summary compression
│   ├── LifecycleToolCallAdvisor.java  # Tool loop + persistence
│   └── TaskProgressAdvisor.java      # Execution round tracking
├── tool/
│   ├── file/ (Read, Write, Edit, Grep, Glob)
│   ├── web/ (WebSearch, WebFetch)
│   ├── rag/ (RagTool)
│   ├── bash/ (BashTool, with security pipeline)
│   ├── agent/ (AgentTool, WorktreeManager, AgentSessionManager)
│   ├── SkillToolConfig.java
│   ├── AskUserQuestionTool.java
│   ├── TaskToolConfig.java
│   └── ToolsManager.java
├── repository/
│   ├── chat/MemoryRepository.java    # MySQL chat history
│   └── rag/ (RagFileRepository, RagChunkRepository)
├── model/
│   ├── chat/ (ChatCompletionChunk, ChatDelta, ToolCall, etc.)
│   └── request/ChatRequest.java
├── config/
│   ├── AiConfig.java                 # AI model beans
│   ├── CorsConfig.java               # CORS for :9500↔:9090
│   ├── WebConfig.java
│   ├── ThreadPoolConfig.java
│   ├── RagConfig.java
│   └── SkillConfig.java
├── loader/
│   ├── SkillLoader.java              # SKILL.md discovery
│   └── SystemMessageLoader.java      # System prompt loading
└── Application.java                  # Entry point
```

### Frontend (`frontend/src/`)

```
├── App.tsx                    # Main chat page, SSE streaming, state machine
├── main.tsx                   # React entry + BrowserRouter
├── index.css                  # Tailwind v4 + custom styles
├── api/
│   ├── chat.ts                # StreamChat async generator + polling APIs
│   ├── knowledgeBase.ts       # KB CRUD
│   ├── pet.ts                 # Pet CRUD
│   └── rag.ts                 # RAG ETL upload
├── components/
│   ├── ChatInput.tsx          # Textarea, send/stop, workspace picker, bypass toggle
│   ├── ChatMessage.tsx        # Block-rendered message (thought/tool-call/text)
│   ├── Sidebar.tsx            # Conversation list (Today/Yesterday/Older)
│   ├── ToolsSidebar.tsx       # KB button + fullscreen overlay
│   ├── QuestionInline.tsx     # Multi-step question form (single/multi-select)
│   ├── CommandApprovalInline.tsx # Inline command approval card
│   ├── HtmlArtifact.tsx       # HTML preview tab
│   ├── KnowledgeBasePanel.tsx # Full KB management UI
│   ├── MarkdownRenderer.tsx   # react-markdown + Prism highlighting
│   ├── RagUploadTool.tsx      # RAG upload component
│   └── pet/PetManagement.tsx  # Pet CRUD grid
├── types/index.ts             # Message, Conversation, Question, etc.
└── utils/
    └── messageParser.ts       # <think> tag parsing, block detection
```

---

## Configuration

### AI Vendors

| Vendor | Model | Usage |
|--------|-------|-------|
| DeepSeek | `deepseek-v4-flash` | Default chat (OpenAI-compatible adapter) |
| MiniMax | `MiniMax-M2.7` | Alternative chat |
| Anthropic | `MiniMax-M2.7` (proxied) | Alternative via MiniMax proxy |
| Embedding | `BAAI/bge-m3` (1024d) | Vector embeddings via SiliconFlow |
| Rerank | `BAAI/bge-reranker-v2-m3` | Result re-ranking via SiliconFlow |

### Databases

| Database | Purpose | Connection |
|----------|---------|------------|
| MySQL `rem-agent` | Chat history, users, tasks | `localhost:3306` |
| PostgreSQL `springai` | Vector embeddings (pgvector) | `localhost:5432` |

---

## Development

```bash
# Backend
./mvnw compile                             # Fast check
./mvnw test                                # Run all tests
./mvnw spring-boot:run                     # Dev profile by default

# Frontend
cd frontend
npm run dev                                # Vite dev server :9500
npm run build                              # Production build
npm run test                               # Vitest
```

### Key Design Decisions

- **Advisor Chain**: Spring AI's pipeline architecture, ordered by `getOrder()`
- **Multi-Vendor LLM**: Strategy pattern, vendor chosen per request via `vendor` field
- **Tool Auto-Discovery**: `ToolsManager` scans all `AgentTool` beans via `ToolCallbacks.from()`
- **Skill Discovery**: Scans `~/.omni/skills/**/SKILL.md` at runtime (no restart needed)
- **Workspace Picker**: JavaFX `DirectoryChooser` for native Windows folder browsing
- **Streaming Abort**: `AbortController` → fetch cancellation → WebFlux `Flux` cancellation
- **Processing Time**: `performance.now()` timing, displayed per assistant message
- **Auth**: Removed entirely — single-user local application

---

## Roadmap

- [x] Advisor Chain pipeline
- [x] Multi-vendor LLM strategy (DeepSeek / MiniMax / Anthropic)
- [x] Streaming SSE protocol with thought/tool-call blocks
- [x] Tool system (File, Web, RAG, Bash, Skill, Task, Agent)
- [x] Sub-Agent system with worktree isolation
- [x] RAG ETL pipeline + recursive chunking
- [x] Skill hot-plug system
- [x] Dangerous command approval flow
- [x] AskUserQuestion inline form (single/multi-select)
- [x] Conversation interruption (real backend abort)
- [x] Processing time display
- [x] JavaFX native workspace folder picker
- [ ] Knowledge base incremental updates
- [ ] Multi-modal support (image/audio)
- [ ] Long-term agent memory
- [ ] Performance optimization

---

## License

MIT License © 2025-2026 LainXXX

GitHub: [https://github.com/LainXXX](https://github.com/LainXXX)
