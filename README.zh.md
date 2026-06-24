# omniAgent

> 你的个人 AI 智能体 —— 全知全能，本地运行，为系统性思考的开发者而生。

[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5.10-green.svg)](https://spring.io/projects/spring-boot)
[![Spring AI](https://img.shields.io/badge/Spring%20AI-1.1.3-blue.svg)](https://spring.io/projects/spring-ai)
[![Java](https://img.shields.io/badge/Java-21-orange.svg)](https://www.oracle.com/java/)
[![React](https://img.shields.io/badge/React-18-cyan.svg)](https://react.dev/)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **[English Docs](README.md)**

**omniAgent** 是一个基于 Spring Boot + Spring AI 的个人 AI 智能体。它将代码理解、文档处理、语义搜索、多厂商 LLM 支持以及可扩展的技能/工具系统整合为一个统一的本地智能助手。

---

## 核心特性

| 类别 | 能力 |
|------|------|
| **代码智能** | 文件读写编辑、代码搜索 (grep/glob)、带安全验证的 Shell 命令执行 |
| **多厂商 LLM** | 策略模式可插拔 — DeepSeek、MiniMax (M2.7)、Anthropic Claude（代理） |
| **文档处理** | PDF、Word (DOCX)、Markdown、TXT 多格式解析 (Apache Tika) |
| **RAG 知识库** | 向量嵌入 (BAAI/bge-m3, 1024d) + pgvector 相似度检索 + Rerank 重排序 |
| **递归分块** | 基于 token 的父子分块 (800/200 tokens)，支持结构感知 |
| **技能系统** | 通过 SKILL.md 热插拔技能，运行时自动发现与注入 |
| **子代理系统** | 分支代理，支持工具过滤、工作目录隔离、会话管理 |
| **流式对话** | 实时 SSE 流式输出，支持思考过程/工具调用/正文分块渲染 |
| **对话打断** | 通过 AbortController + WebFlux 实现真实的后端 LLM 取消 |
| **原生目录选择** | JavaFX DirectoryChooser，获取完整绝对路径 |

---

## 快速上手

### 环境依赖

| 依赖 | 版本要求 |
|------|----------|
| Java | 21+ |
| MySQL | 8.0+ |
| PostgreSQL | 15+（需安装 pgvector 扩展） |
| Maven | 3.9+ |
| Node.js | 18+（前端） |

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/LainXXX/omniAgent.git
cd omniAgent

# 2. 创建数据库
# MySQL: 创建 rem-agent 数据库
# PostgreSQL: 创建 springai 数据库并安装 pgvector 扩展

# 3. 配置 AI 提供商
# 编辑 src/main/resources/application-dev.yml 填入你的 API Key

# 4. 启动后端（端口 9090）
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# 5. 启动前端开发服务器（端口 9500）
cd frontend
npm install
npm run dev
```

打开 `http://localhost:9500` 即可开始对话。

---

## 系统架构

### 整体架构

```
┌─────────────┐     ┌──────────────────────────────────────────────────┐
│  React SPA  │     │             Spring Boot 后端                     │
│  :9500      │     │             :9090                               │
│             │     │                                                  │
│  ChatInput  │◄───►│  ChatController → ChatService                    │
│  ChatMessage│ SSE │       → ChatModelStrategyFactory                 │
│  Sidebar    │     │         ├── DeepSeekChatStrategy                 │
│  ToolsSide  │     │         ├── MiniMaxChatStrategy                  │
│  Question   │     │         └── AnthropicChatStrategy                │
│  Inline     │     │                                                  │
│             │     │  Advisor 链                                      │
│  Knowledge  │     │    MessageFormat (order: 10000)                  │
│  Base Panel │     │    ContextCompression (order: 4000)              │
│             │     │    LifecycleToolCall (order: MAX-1)              │
│             │     │    TaskProgress (order: MAX-100)                 │
└─────────────┘     │                                                  │
                    │  工具: File │ Web │ RAG │ Bash │ Skill │ Agent   │
                    │                                                  │
                    │  MySQL（对话历史）                                │
                    │  PostgreSQL + pgvector（向量存储）                │
                    └──────────────────────────────────────────────────┘
```

### Advisor 链流程

```
请求 → MessageFormatAdvisor.before()
    → LifecycleToolCallAdvisor.doInitializeLoopStream()
    → 工具调用循环
    → ChatClientMessageAggregator
    → LifecycleToolCallAdvisor.doFinalizeLoopStream()
    → MessageFormatAdvisor.after()
    → 响应
```

### SSE 流式协议

```
data:{"id":"...","choices":[{"delta":{"content":"...","reasoning_content":"...","tool_calls":[...]},"finish_reason":"tool_calls"}]}
data:[DONE]
```

- 格式：OpenAI 兼容 delta 格式
- 事件类型：`text`、`thought`、`tool-call`、`round-end`、`dangerous-command`

---

## 项目结构

### 后端 (`src/main/java/top/javarem/omni/`)

```
├── controller/
│   ├── ChatController.java           # SSE 流式聊天
│   ├── AskUserQuestionController.java # 问题轮询
│   ├── ApprovalController.java       # 命令审批 + SSE 推送
│   ├── KnowledgeBaseController.java  # 知识库管理
│   ├── PetController.java            # 宠物管理演示
│   └── WorkspaceController.java      # JavaFX 目录选择器
├── service/
│   ├── ChatService.java              # 聊天编排
│   ├── AskUserQuestionService.java   # 问题流程
│   └── rag/ (ETL、分块、分词)
├── strategy/                         # LLM 多厂商适配
│   ├── ChatModelStrategy.java        # 接口
│   ├── ChatModelStrategyFactory.java # 注册中心
│   ├── DeepSeekChatStrategy.java
│   ├── MiniMaxChatStrategy.java
│   ├── AnthropicChatStrategy.java
│   └── SseChunkEncoder.java
├── advisors/ (4 个 Advisor)
├── tool/ (file、web、rag、bash、agent、tools)
├── repository/ (chat + rag)
├── model/
├── config/ (AI、CORS、Web、线程池、RAG、Skill)
├── loader/ (SkillLoader、SystemMessageLoader)
└── Application.java
```

### 前端 (`frontend/src/`)

```
├── App.tsx                    # 主聊天页面
├── main.tsx                   # 入口 + 路由
├── index.css                  # Tailwind v4
├── api/ (chat、knowledgeBase、pet、rag)
├── components/ (12 个组件)
│   ├── ChatInput.tsx          # 输入框 + 工作区选择
│   ├── ChatMessage.tsx        # 分块渲染消息
│   ├── QuestionInline.tsx     # 多步问题表单
│   ├── CommandApprovalInline.tsx # 命令审批卡片
│   ├── KnowledgeBasePanel.tsx # 知识库管理界面
│   ├── Sidebar.tsx            # 对话列表
│   ├── ToolsSidebar.tsx       # 工具面板
│   └── ...
├── types/index.ts
└── utils/messageParser.ts     # <think> 标签解析
```

---

## 配置说明

### AI 供应商

| 供应商 | 模型 | 用途 |
|--------|------|------|
| DeepSeek | `deepseek-v4-flash` | 默认聊天（OpenAI 兼容） |
| MiniMax | `MiniMax-M2.7` | 备用聊天 |
| Anthropic | `MiniMax-M2.7`（代理） | 通过 MiniMax 代理 |
| 嵌入 | `BAAI/bge-m3` (1024d) | 向量嵌入 |
| 重排序 | `BAAI/bge-reranker-v2-m3` | 搜索重排序 |

### 数据库

| 数据库 | 用途 | 连接 |
|--------|------|------|
| MySQL `rem-agent` | 对话历史 | `localhost:3306` |
| PostgreSQL `springai` | 向量存储 (pgvector) | `localhost:5432` |

---

## 开发指南

```bash
# 后端
./mvnw compile                             # 快速编译
./mvnw test                                # 运行测试
./mvnw spring-boot:run                     # 启动开发服务器

# 前端
cd frontend
npm run dev                                # Vite 开发 :9500
npm run build                              # 生产构建
npm run test                               # 单元测试
```

### 关键设计决策

- **Advisor 链**：Spring AI 管道架构，通过 `getOrder()` 排序
- **多厂商**：策略模式，通过 `vendor` 字段选择厂商
- **工具发现**：`ToolsManager` 自动扫描所有 `AgentTool` Bean
- **技能发现**：运行时扫描 `~/.omni/skills/**/SKILL.md`
- **目录选择**：JavaFX `DirectoryChooser` 原生 Windows 对话框
- **流式打断**：`AbortController` → `fetch` 取消 → `Flux` 取消
- **处理耗时**：每条助手消息显示 `performance.now()` 耗时
- **鉴权**：已完全移除——单用户本地应用

---

## 路线图

- [x] Advisor 链管道
- [x] 多厂商 LLM 策略 (DeepSeek / MiniMax / Anthropic)
- [x] SSE 流式协议 + 思考/工具调用分块
- [x] 工具系统 (File、Web、RAG、Bash、Skill、Task、Agent)
- [x] 子代理系统 + 工作目录隔离
- [x] RAG ETL 管道 + 递归分块
- [x] 技能热插拔系统
- [x] 危险命令审批流程
- [x] 用户问题内联表单（单选/多选）
- [x] 对话打断（真正的后端取消）
- [x] 处理耗时显示
- [x] JavaFX 原生目录选择器
- [ ] 知识库增量更新
- [ ] 多模态支持（图片/音频）
- [ ] 长期 Agent 记忆
- [ ] 性能优化

---

## 许可证

MIT License © 2025-2026 LainXXX

GitHub: [https://github.com/LainXXX](https://github.com/LainXXX)
