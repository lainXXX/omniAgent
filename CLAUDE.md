# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**OmniAgent** — a Spring Boot 3.5.10 AI Agent system with multi-vendor LLM support, tool-calling capabilities, RAG document processing, and a React/Vite frontend. Designed as a graduation thesis project.

---

## Build & Run Commands

```bash
# Backend
./mvnw clean package -DskipTests          # Build
./mvnw spring-boot:run                    # Run (dev profile active by default)
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
./mvnw test                               # Run all tests
./mvnw test -Dtest=ClassName#methodName   # Single test
./mvnw compile                            # Fast check

# Frontend (separate Node project)
cd frontend
npm run dev                               # Dev server on :9500
npm run build                             # Production build
npm run test                              # Vitest
```

---

## Backend Architecture (`src/main/java/top/javarem/omni/`)

### Package Structure

| Package | Responsibility |
|---------|---------------|
| `controller/` | REST endpoints: chat, auth, questions, knowledge-base, pet |
| `service/` | Business logic: ChatService, AskUserQuestionService, RAG ETL |
| `service/rag/` | RAG pipeline: ETL, text splitting, token counting |
| `service/chat/` | LLM chat orchestration, ChatModelStrategy multi-vendor adapter |
| `service/chat/strategy/` | `DeepSeekChatStrategy`, `MiniMaxChatStrategy`, `AnthropicChatStrategy` |
| `advisors/` | Spring AI Advisor chain: lifecycle, context compression, message format, task progress |
| `tool/` | All AgentTool implementations |
| `tool/file/` | Read/Write/Edit/Grep/Glob file tools |
| `tool/web/` | WebSearch, WebFetch tools |
| `tool/bash/` | Bash execution with security validation |
| `tool/rag/` | RAG query tool |
| `tool/agent/` | Sub-agent system: launch, session management, worktree isolation |
| `tool/approval/` | AskUserQuestion and DangerousCommand approval flow |
| `repository/chat/` | MySQL chat history (MemoryRepository) |
| `repository/rag/` | PostgreSQL kb_file operations (RagFileRepository) |
| `config/` | Spring configuration: security, web, thread pool, RAG, skills |
| `model/` | DTOs, entities, records |
| `security/` | JWT auth, user details, filters |
| `loader/` | SkillLoader, SystemMessageLoader |

### Controllers

| Controller | Endpoints | Purpose |
|------------|-----------|---------|
| `ChatController` | `POST /chat/stream` | SSE streaming chat, multi-vendor dispatch |
| `AuthController` | `/api/auth/login`, `/register`, `/logout`, `/me` | JWT-based authentication |
| `AskUserQuestionController` | `GET /api/questions/pending`, `POST /api/questions/{id}/answer` | Question polling & answering |
| `ApprovalController` | `GET /approval/pending`, `POST /approval`, `GET /approval-events` | Dangerous command approval + SSE push |
| `KnowledgeBaseController` | `/api/knowledge-base/stats`, `/files`, `/files/upload`, `/files/{id}`, `/files/{id}/retry`, `/search` | Knowledge base CRUD + search |
| `PetController` | `/api/pet` CRUD | Pet management demo |

### LLM Multi-Vendor Adapter (`service/chat/`)

Strategy pattern for multi-LLM support:

```
ChatService → ChatModelStrategyFactory → ChatModelStrategy (interface)
                                           ├── DeepSeekChatStrategy
                                           ├── MiniMaxChatStrategy
                                           └── AnthropicChatStrategy
```

- Each strategy implements `doStream()` returning `Flux<String>` (raw JSON chunks)
- `SseChunkEncoder` wraps raw JSON, extracts `id` for SSE event IDs
- Backend sends: `data:{json}\n\n` — no space after `data:`, no `event:` field
- Protocol: OpenAI-Compatible delta format (`delta.content`, `delta.reasoning_content`, `delta.tool_calls`)
- Fallback chain: if primary vendor fails, try next; if all fail, fallback to DeepSeek

### Advisor Chain System

Spring AI Advisor pipeline (ordered by `getOrder()`):

| Advisor | Order | Responsibility |
|---------|-------|----------------|
| `MessageFormatAdvisor` | `ORDER_BEFORE_PROMPT_CONVERSION` (10000) | Loads system prompt, injects skills, loads history |
| `ContextCompressionAdvisor` | 4000 | Compresses long conversations (head+tail+summary) |
| `LifecycleToolCallAdvisor` | `Integer.MAX_VALUE - 1000` | Tool call lifecycle, message persistence, stream/call modes |
| `TaskProgressAdvisor` | `Integer.MAX_VALUE - 100` | Tracks exec_rounds, detects stalled tasks |

**Call flow**: `MessageFormatAdvisor.before()` → `LifecycleToolCallAdvisor.doInitializeLoop()` → ToolCall Loop → `LifecycleToolCallAdvisor.doFinalizeLoop()` → `MessageFormatAdvisor.after()`

**Stream mode flow**:
```
Request → MessageFormatAdvisor.before() → LifecycleToolCallAdvisor.doInitializeLoopStream()
       → ToolCall Loop (doGetNextInstructionsForToolCallStream)
       → ChatClientMessageAggregator.aggregateChatClientResponse()
       → LifecycleToolCallAdvisor.doFinalizeLoopStream() → Response
```

### Tool System (`tool/`)

| Package | Tools |
|---------|-------|
| `file/` | `ReadToolConfig`, `WriteToolConfig`, `EditToolConfig`, `GrepToolConfig`, `GlobToolConfig` |
| `web/` | `WebSearchToolConfig`, `WebFetchToolConfig` |
| `rag/` | `RagToolConfig` (semantic search over vector store) |
| `bash/` | `BashToolConfig` (with security pipeline) |
| root | `SkillToolConfig`, `AskUserQuestionTool`, `TaskToolConfig`, `AgentTool` (marker interface), `ToolsManager` |

- `AgentTool` — marker interface; `ToolsManager` auto-discovers all `AgentTool` beans via `ToolCallbacks.from()`
- `AskUserQuestionTool` — pauses execution, creates `CompletableFuture`, yields via `AskUserQuestionYieldException`. Frontend polls then submits answer to complete the future.

### Agent Subsystem (`tool/agent/`)

| Class | Purpose |
|-------|---------|
| `AgentToolConfig` | Entry point: `launchAgent` + `agentOutput` tools |
| `SubAgentChatClientFactory` | Creates isolated ChatClient per agent type, tool filtering, One-Shot mode |
| `AgentSessionManager` | In-memory session history for agent resume |
| `AgentTaskRegistry` | Async task tracking with ownership checks |
| `WorktreeManager` | Git worktree isolation for agent tasks |
| `AgentType` | Enum: `EXPLORE` (One-Shot), `PLAN` (One-Shot), `VERIFICATION` (One-Shot), `GENERAL`, `CODE_REVIEWER` |

**Tool filtering**: Each `AgentType` has `allowedTools` set; factory filters accordingly.

### Bash Security Architecture (`tool/bash/`)

| Component | Responsibility |
|-----------|---------------|
| `DangerousPatternValidator` | Regex-based pattern matching for dangerous commands |
| `SuicideCommandDetector` | Detects system-destroying commands (rm -rf, fork bombs) |
| `CommandApprover` | Central approval gate with SSE push to frontend |
| `ProcessTreeKiller` | Cleanup on timeout/termination |
| `PathApprovalService` | Approved execution paths management |

### RAG System (`service/rag/`)

| Component | Purpose |
|-----------|---------|
| `AdvancedRagEtlService` | ETL pipeline: extract text → split → embed → store |
| `RecursiveTextSplitter` | Token-aware recursive text chunking |
| `MarkdownHeaderSplitter` | Markdown structure-aware splitting |
| `TokenCounter` | JTokkit-based token counting |
| `ParentChildSplitter` | Parent-child chunk relationship (parent=800 tokens, child=200 tokens) |

**ETL flow**: Upload file → Tika text extraction → Parent-child splitting → Embed (ZhipuAI/BAAI/bge-m3) → Store in PostgreSQL pgvector

### Skill System (`loader/`)

- `SkillLoader` — scans configured directories for `SKILL.md` files
- `SystemMessageLoader` — loads system prompt from `agent_system_prompt.md`
- Skill discovery sources: `bundled` (classpath), `managed` (~/.claude/skills/), `user` (~/.omni/skills/)
- Skills use YAML front matter (`name`, `description`, `tool`)
- Each skill defines its own behavior rules

### SSE Streaming Protocol

**Wire format** (backend → frontend):
```
data:{"id":"...","choices":[{"delta":{"content":"...","reasoning_content":"...","tool_calls":[...]},"finish_reason":"tool_calls"}]}
data:[DONE]
```

- Backend: `SseChunkEncoder` returns raw JSON, Spring Boot's `ServerSentEventHttpMessageWriter` adds `data:` prefix
- `finish_reason: "tool_calls"` signals round-end (tool loop iteration complete)
- Frontend `streamChat()`: reads raw `ReadableStream`, parses `data:` lines, yields `StreamEvent` objects
- Events: `text`, `thought`, `tool-call`, `round-end`
- Approval events use separate SSE channel: `/approval-events` (EventSource)

### Security & Authentication

- **Auth**: JWT-based, stored in cookie (HttpOnly), verified by `JwtAuthFilter`
- `SecurityConfig`: permits `/api/auth/`, `/chat/stream`, `/approval-events`, `/api/knowledge-base/static`
- **Password**: BCrypt
- `UserDetailsServiceImpl`: loads from MySQL `users` table
- CORS: allows `localhost:5173` (Vite dev), `localhost:9090`

---

## Frontend Architecture (`frontend/src/`)

### Directory Structure

```
src/
├── App.tsx                  # Main chat page: SSE streaming, state, polling
├── main.tsx                 # React entry + BrowserRouter
├── index.css                # Tailwind v4 + custom styles + animations
├── api/
│   ├── auth.ts              # Login/register/logout API
│   ├── chat.ts              # SSE streamChat() async generator + polling APIs
│   ├── knowledgeBase.ts     # KB CRUD + stats + search
│   ├── pet.ts               # Pet CRUD API
│   └── rag.ts               # RAG ETL upload API
├── components/
│   ├── AuthRoute.tsx        # Redirect if authenticated
│   ├── PrivateRoute.tsx     # Redirect if not authenticated
│   ├── ChatInput.tsx        # Message input: textarea + send + workspace + bypass
│   ├── ChatMessage.tsx      # Block-rendered message: thought, tool-call, text
│   ├── CommandApprovalInline.tsx  # Inline command approval card
│   ├── DangerousCommandModal.tsx  # Modal command approval (unused)
│   ├── HtmlArtifact.tsx     # HTML preview: code tab + iframe preview tab
│   ├── KnowledgeBasePanel.tsx     # Full KB management UI
│   ├── MarkdownRenderer.tsx # react-markdown + Prism syntax highlighting
│   ├── QuestionInline.tsx   # Multi-step question form with navigation
│   ├── RagUploadTool.tsx    # Standalone RAG upload tool
│   ├── Sidebar.tsx          # Conversation list (Today/Yesterday/Older)
│   ├── ToolsSidebar.tsx     # Floating KB button + fullscreen overlay
│   └── pet/PetManagement.tsx # Pet CRUD grid + modal form
├── context/AuthContext.tsx  # Global auth state (User, login, logout)
├── pages/
│   ├── LoginPage.tsx        # Login form
│   └── RegisterPage.tsx     # Registration form
├── types/index.ts           # Message, Conversation, Question, ChatStep, etc.
└── utils/
    ├── messageParser.ts     # <think> tag parsing, block detection
    └── parseBlocks.ts       # Backup block parser (unused)
```

### Streaming State Machine (App.tsx)

1. `handleSend(text)` → creates conversation, starts SSE stream + approval SSE + question polling
2. Event loop over `streamChat()` yields `StreamEvent`:
   - `thought` → append to `thoughtBufferById[roundIndex]`, update streaming block
   - `tool-call` → set `toolName`/`toolInput` on latest thought block
   - `text` → append to `textBufferById[roundIndex]`, update streaming block
   - `round-end` → increment `roundIndex`
   - `dangerous-command` → stop stream, show approval UI
3. Stream ends → construct `Message` with `blocks[]` array → push to history

### Question Polling Flow

- `setInterval` polls `GET /api/questions/pending` every 2s
- When `hasQuestion === true`, stop polling, render `<QuestionInline>`
- User answers → `POST /api/questions/{id}/answer` → answer appended as user message → resume polling

### Approval Flow

- `EventSource` connects to `/approval-events`, listens for `dangerous-command`
- `CommandApprovalInline` renders with Approve/Reject buttons
- `submitApproval(ticketId, command, approved)` → backend resumes or cancels

### Key Dependencies

- React 18 + react-router-dom 6 + lucide-react (icons)
- react-markdown + react-syntax-highlighter (Prism) + remark-gfm
- Tailwind CSS v4 + `@tailwindcss/typography`

### Routing

```
/          → PrivateRoute → ChatPage (main chat)
/login     → AuthRoute    → LoginPage
/register  → AuthRoute    → RegisterPage
*          → Navigate to "/"
```

---

## Database

### MySQL (`rem-agent`)

| Table | Purpose |
|-------|---------|
| `spring_ai_chat_memory` | Chat history: id, conversation_id, content, type (USER/ASSISTANT/SYSTEM/TOOL), timestamp |
| `kb_file` | Knowledge base file records: id, kb_id, filename, status, total_chunks, timestamps |
| `users` | Authentication: id, username, password (BCrypt) |
| `chat_memory` | Linked-list message storage with parent_id tree |
| `ai_tasks` | Task progress tracking |

### PostgreSQL (`springai`) with pgvector

| Table | Purpose |
|-------|---------|
| `vector_store` | Embeddings (1024d) + metadata, HNSW index, cosine distance |
| `rag_parent_chunks` | RAG parent chunks (800 tokens) |
| `spring_ai_chat_memory` | Chat history mirror (for vector search) |
| `ai_tasks` | Task tracking |

---

## Configuration

- **Main**: `application.yml` (default provider, memory threshold)
- **Dev**: `application-dev.yml` (DB, AI vendors, RAG, threading, CORS)
- **Test**: `application-test.yml`
- **Frontend proxy**: `vite.config.ts` proxies `/chat`, `/api`, `/approval` → `localhost:9090`
- **Approved commands**: `approved-commands.properties`
- **System prompt**: `agent_system_prompt.md`

### AI Vendors

| Vendor | Model | Key Config |
|--------|-------|------------|
| DeepSeek | `deepseek-v4-flash` via OpenAI adapter | `spring.ai.openai.*` |
| MiniMax | `MiniMax-M2.7` | `spring.ai.minimax.*` |
| Anthropic | `MiniMax-M2.7` (proxied via MiniMax) | `spring.ai.anthropic.*` base-url to MiniMax proxy |
| ZhipuAI | `embedding-3` (for embeddings) | `spring.ai.zhipuai.*` |
| Embedding | `BAAI/bge-m3` (1024d) via SiliconFlow | `spring.ai.openai.embedding.*` |
| Rerank | `BAAI/bge-reranker-v2-m3` via SiliconFlow | top-n=3 |

---

## Development Guidelines

**See also**: [docs/DEVELOPMENT_GUIDELINES.md](docs/DEVELOPMENT_GUIDELINES.md)

- **Comments**: Chinese, structured Javadoc — explain WHY, not WHAT
- **Logging**: `[ClassName]` prefix (e.g., `[RagFileRepository]`)
- **Code style**: Early Return, semantic naming, no vague variables
- **Testing**: TDD, UUID isolation in tests
- **Git**: `<type>(<scope>): <subject>` in **Chinese**
- **Frontend**: Tailwind v4, dark mode via `.dark` class, mobile-responsive, shadcn-inspired minimalism
- **Adding a vendor**: Create new `ChatModelStrategy` implementation + `@Component`, no routing changes needed
- **Adding a tool**: Implement `AgentTool` interface, `ToolsManager` auto-discovers via `ToolCallbacks.from()`
- **Adding a skill**: Create `SKILL.md` in the scanned skills directory with YAML front matter
