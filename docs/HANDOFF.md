# 项目交接文档（Claude Code → Codex）

> - **生成日期**：2026-06-28
> - **最近更新**：2026-06-28（Codex Phase B 接手后更新）
> - **用途**：从 Claude Code 切换到 Codex 继续开发。本文一次性加载即可了解全貌，按需查阅引用文档。**不需要每次加载到上下文。**
> - **当前进度**：Phase A 已完成并推送到 GitHub；Phase B 已在 `phase-b-docker-compose` 分支完成并推送；下一步 Phase C。

---

## 0. 一句话定位

把第三方收费项目 `ai-job`（BOSS直聘 AI 自动投递/打招呼工具）二次开发成**自托管、免费、接入自有 OpenAI 兼容模型**的版本。当前 Phase A（后端去付费）已完成，Phase B（Docker Compose 本地部署）已完成。

---

## 1. 项目背景

**被改造项目**：`reference_projects/ai-job`（来源 gitee: yangfeng20/ai-job）

这是一个在 BOSS直聘页面运行的「AI 自动投递/打招呼」工具，由三部分组成：
- **油猴脚本** `ai-job-hunting.user.js`（35K 行）/ `bundle.user.js`（87K 行，打包含依赖）：注入 BOSS 页面，Hook BOSS 的 WebSocket 解码 HR 消息，调后端 AI 生成回复并代发
- **Java 后端** `ai-job-hunting-server/`（Spring Boot 3.2.5）：AI 调用、数据存储、付费授权、支付宝支付
- **前端工程** `ai-job-hunting-ui/`（Vue3+TS）：**不是独立后台**，而是油猴脚本的源码工程，`pnpm build` 产出 `.user.js`

**原项目的问题（二次开发要解决的）**：
1. **收费**：支付宝当面付 + ProductFilter 产品授权 + 试用 + 邀请兑换。用户要付费才能用 AI 功能
2. **依赖作者服务器**：油猴脚本默认指向作者官方服务器 `https://43.138.246.37/`（约 2026-04-13 已关停），且存在向旧服务器发请求的隐患
3. **AI 模型绑定**：默认走作者的服务端模型池（运营方 key），用户想用自己的模型要付费买"自有API"套餐

**选型决策**（2026-06-24，详见 `reference_projects/项目对比与选型建议.md`）：用户对比了 `ai-job`（Java+油猴，能自动发招呼）和 `ai-job-assistant`（Python+扩展，只做分析不自动发）两个项目。用户要"自动发招呼 + 智能筛选"两者都要，**选定 `ai-job`**（它 12 项功能已同时包含两者），排除 `ai-job-assistant`。

---

## 2. 目标人群与目的

- **目标用户**：仅开发者本人（单用户、自托管、本地部署）
- **核心目的**：免费使用 + 接入自己的 AI 模型（DeepSeek / 通义 DashScope / OpenAI 等 OpenAI 兼容模型）
- **不做的**：不分发、不商用、不做多租户、不重建在线服务

---

## 3. 项目架构

整体三段式架构（二次开发不改架构，只定向改造）：

```
┌─────────────────────┐     HTTPS REST + SSE      ┌──────────────────┐
│  油猴脚本            │ ◀──────────────────────▶ │  Java 后端        │
│ (注入 BOSS 页面)     │                            │  (Spring Boot)    │
│ - Hook BOSS WebSocket│                            │ - Spring AI      │
│ - 解码 HR 消息       │                            │ - 多模型池/自定义  │
│ - AI 生成招呼语      │                            │ - MySQL 存储      │
│ - 代发消息/批量投递   │                            │ - SmartConfig 6768│
└─────────┬───────────┘                            └────────┬─────────┘
          │ WebSocket Hook + 直调 BOSS 官方接口              │ JDBC
          ▼                                                ▼
   ┌──────────────┐                               ┌──────────────┐
   │  BOSS直聘    │                               │   MySQL      │
   │  (HTTPS 页面)│                               │  (ai_job 库) │
   └──────────────┘                               └──────────────┘
```

**关键数据流（改造后，自有模型场景）**：
```
油猴面板填 base_url/api_key/model
  → POST /api/user/ai/config/save (去付费后放行)
  → 落 user_ai_config 表，启用自有API
HR 来消息 → POST /api/job/seeker/cloned/ask → AIServiceFacade.sessionChat
  → 命中 getEnabledConfig → CustomOpenAIService
  → CompletionPathOpenAiApi 非流式 POST {你的base_url}/chat/completions
```

**油猴脚本↔后端通信**：页面上下文 `axios`（`ai-job-hunting-ui/src/axios.ts`）+ `EventSourcePolyfill`（SSE），**受浏览器混合内容策略约束** → 本地 `http://localhost` 豁免不需 SSL，远程必须 HTTPS。

---

## 4. 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 后端语言 | Java | 17 |
| 后端框架 | Spring Boot | 3.2.5 |
| AI 框架 | Spring AI | 0.8.1 |
| ORM | MyBatis-Plus | 3.5.5 |
| 数据库 | MySQL | 5.x/8.x |
| 缓存 | 自研内存缓存（无 Redis） | — |
| 构建工具 | Maven | 3.9.16 |
| 前端/油猴脚本 | Vue 3 + TypeScript | Vue 3.4 / TS 5.3 |
| 前端构建 | Vite 5 + vite-plugin-monkey | — |
| 前端 UI | Element Plus + Pinia + axios | — |
| 测试（后端） | JUnit5 + Mockito + MockMvc | — |
| 测试（前端） | Vitest + jsdom | — |
| 部署 | Docker Compose | — |

**AI 模型接入**：项目已内置 `CompletionPathOpenAiApi`（重写 OpenAI 端点路径，支持 `extraBody`），已兼容任意 OpenAI 兼容厂商。`AIProviderEnum` 内置 DeepSeek/火山/硅基流动/Kimi/OpenRouter 6 厂商 + 自定义。**接入自有模型代码层面已支持，0 改动**，只需在 UI 面板填配置 + 去掉付费闸门。

---

## 5. 项目结构

```
AI-Job/                          ← git 根仓库（推送到 GitHub）
├── .gitignore                   ← 已排除 reference_projects/、构建产物等
├── docs/
│   ├── HANDOFF.md               ← 本文件
│   └── superpowers/
│       ├── specs/2026-06-24-ai-job-secondary-dev-design.md   ← 设计 spec
│       └── plans/2026-06-24-ai-job-secondary-dev.md           ← 实现计划(12任务5阶段)
├── ai-job-dev/                  ← ★ 开发工作区（参考项目的副本，在这里改）
│   ├── ai-job-hunting-server/   ← Java 后端
│   ├── ai-job-hunting-ui/       ← Vue 源码（构建油猴脚本）
│   ├── ai-job-hunting.user.js   ← 油猴脚本产物
│   └── ...
└── reference_projects/          ← 第三方参考代码（已 gitignore，不要改）
    ├── ai-job/                  ← 原始参考项目（已改，保持当前状态）
    ├── ai-job-analysis/         ← 对 ai-job 的探索文档(4份md)
    ├── ai-job-assistant/        ← 另一个对比项目
    ├── ai-job-assistant-analysis/
    └── 项目对比与选型建议.md
```

**本机正确工作目录**：`/Users/tanglin/VibeCoding/GetJobs/AI-Job`

> 注意：不要在 `/Users/tanglin/VibeCoding/AIStockMonitoring/` 下继续本项目任务。此前误拉取的 `/Users/tanglin/VibeCoding/AIStockMonitoring/automatic_get_jobs` 已按用户要求删除。

### ⚠️ 两个 git 仓库（重要！）

1. **根仓库 `AI-Job/`** ← 推送到 GitHub 的仓库
   - 远程：`https://github.com/fanly93/automatic_get_jobs.git`
   - `main`：Phase A + 交接文档
   - `phase-b-docker-compose`：Phase B 已完成并推送
   - **要同步 GitHub，在这里 `git add && commit && push`**

2. **子仓库 `ai-job-dev/`** ← 有自己的 `.git`
   - 仅本地，1 个 commit（Phase A）
   - **它的 commit 不会推到 GitHub**（推送时已作为普通目录并入根仓库）

**工作流约定**：后续开发请直接在根仓库 `AI-Job/` 提交并 push。`ai-job-dev/` 里的本地 git 历史只是记录，不会自动同步。

---

## 6. 二次开发目标（详细 spec）

完整设计见 `docs/superpowers/specs/2026-06-24-ai-job-secondary-dev-design.md`。核心 7 项交付物：

1. **去付费双保险**（Phase A，✅已完成）：`UserProductMapper` 恒返回全部套餐 + `ProductFilter` 首行放行
2. **收款码逻辑彻底删除**（Phase C）：移除 `Product.vue`/`AiJob.vue` 二维码渲染 + 购买/兑换菜单 + 5001 拦截器
3. **旧服务器地址清除**（Phase C）：改 `axios.ts:30`/`stores/server.ts:6`/`AiJob.vue:310` 三处默认值为本地地址
4. **接自有模型**（Phase D 验证）：用户级 UI 面板配置（`user_ai_config` 表），代码 0 改动
5. **OCR 改走用户级视觉模型**（Phase D）：改 `use-ai-map` 路由，**待 `readFile` 是否支持图像验证**
6. **Docker Compose 部署**（Phase B）：后端+MySQL 容器化，参数化配置，改 SmartConfig 密码
7. **新增测试套件**（贯穿）：后端单测 + 集成测试 + 前端 Vitest + curl 回归脚本

**Out-of-scope**（明确不做）：流式输出、多账号、智联等其他平台、阶段二删表（有连锁依赖风险，列为后续）。

---

## 7. 当前进度

### ✅ Phase A：后端去付费核心（已完成，已推送 GitHub）

**完成内容**：

| Task | 改动 | 文件 |
|------|------|------|
| Task 1 部署修复 | 删 pom.xml 硬编码 Windows javac 路径 + 补 Lombok 依赖声明/注解处理器 | `ai-job-dev/ai-job-hunting-server/pom.xml` |
| Task 2 去付费闸门1 | `queryUserValidAllProductType` 恒返回全部 `ProductTypeEnum` code | `ai-job-dev/.../mapper/UserProductMapper.java` |
| Task 3 去付费闸门2 | `doFilter` 首行直接 `filterChain.doFilter(); return;`（原逻辑注释保留） | `ai-job-dev/.../frame/filter/ProductFilter.java` |

**测试**（TDD 红绿已验证）：
- `ai-job-dev/.../mapper/UserProductMapperTest.java` — Mockito 验证恒返回
- `ai-job-dev/.../frame/filter/ProductFilterTest.java` — MockFilterChain 验证放行

**阶段验收**：2 个测试全绿 + `mvn test-compile` 全量通过无回归。

**Git**：根仓库 commit `c7ef0c3`，已 push 到 `origin/main`。

### ✅ Phase B：Docker Compose 部署编排（已完成，已推送 GitHub 分支）

**完成内容**：

| Task | 改动 | 文件 |
|------|------|------|
| Task 7 Dockerfile | 基础镜像改为官方 `eclipse-temurin:17-jre`，修正 JVM 参数顺序为 `java -XX:+StartAttachListener -jar` | `ai-job-dev/ai-job-hunting-server/src/main/resources/docker/Dockerfile` |
| Task 7 Compose | 新增 MySQL 8.0、healthcheck、内部网络、数据/日志 volume、schema 初始化挂载，移除外部网络依赖 | `ai-job-dev/ai-job-hunting-server/src/main/resources/docker/docker-compose.yml` |
| Task 7 配置 | MySQL 用户/密码参数化，JDBC URL 增加 `allowPublicKeyRetrieval=true` 兼容 MySQL 8；SmartConfig 登录密码改为 `change-me-please` | `ai-job-dev/ai-job-hunting-server/src/main/resources/application.properties` |

**SmartConfig 登录说明**：
- 地址：`http://127.0.0.1:6768/`
- 用户名：`admin`
- 密码：`change-me-please`
- 注意：`smart-config-core` 的 `StringLineLoader` 只按 `key=value` 读配置文件，不解析 Spring `${ENV:default}` 占位符。因此 `smart.username` / `smart.password` 不能写成 `${SMART_USERNAME:...}` 这类形式，否则登录会把占位符字面量当作密码。

**验收**：
- `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home mvn clean package -DskipTests -q` 通过
- `docker compose build && docker compose up -d --force-recreate` 通过
- `ai-job-mysql` healthy，`ai-job` running
- `curl http://127.0.0.1:9100/` 返回 `200`
- `curl http://127.0.0.1:6768/` 返回 `200`
- SmartConfig 登录接口 `admin / change-me-please` 返回 `{"code":200,"message":"success","data":null}`

**Git**：
- `8a29274 feat: add Docker Compose deployment for ai-job`
- `e1f5852 fix: make SmartConfig login usable in Docker`
- 分支：`phase-b-docker-compose`
- 远程：已 push 到 `origin/phase-b-docker-compose`

### ⚠️ 过程中解决的两个预存在缺陷（非 plan 预期，但必须修，否则编译不了）

1. **项目根本没声明 Lombok 依赖**——原作者靠 IDE 插件编的，命令行 `mvn` 完全编不过。补了依赖 + `annotationProcessorPaths`（锁版本 1.18.36）。
2. **brew 装 maven 时拖进了 JDK 26**——Lombok 反射访问 JDK26 的 javac 内部失败（报 `TypeTag :: UNKNOWN`）。用 `JAVA_HOME` 强制 Maven 走 JDK 17 解决。

---

## 8. 未完成任务

### 🔶 Phase C：前端改造与重编译
- Task 4：改 `axios.ts:30`/`stores/server.ts:6`/`AiJob.vue:310` 三处旧服务器地址 → `http://127.0.0.1:9100`
- Task 5：删 `Product.vue`/`AiJob.vue` 收款码渲染 + `Panel.vue` 购买/兑换菜单
- Task 6：`pnpm build` 重编译油猴脚本，验证 `grep 43.138.246.37` 零残留、`grep qrCodeBase64` 已移除
- Task 10：装 Vitest，写 Panel/AiConfig 组件测试

### 🔶 Phase D：后端功能与 API 级验证
- Task 8：MockMvc 集成测试验证无 5001、走 CustomOpenAIService
- Task 9：OCR 路由 `use-ai-map` 的 `"file"` 从 `kimi` → 视觉模型（**先验证 `readFile` 支持图像，不支持则补多模态分支或降级**）
- Task 11：curl 回归脚本 `verify.sh`

### 🔶 Phase E：BOSS 端到端验证（手动，需浏览器+真实账号）
- Task 12：装油猴脚本、配置 DeepSeek、触发 AI 坐席、验证网络面板无旧服务器请求

### 🔶 全部完成后：完整测试套件
后端单测 + 集成测试 + 前端 Vitest + curl 脚本 + 端到端清单，五层完整流程测试。

---

## 9. 下一阶段计划（Phase C）

完整步骤见 `docs/superpowers/plans/2026-06-24-ai-job-secondary-dev.md` 的 **Task 4、Task 5、Task 6、Task 10**。要点：

1. 改 `ai-job-hunting-ui/src/axios.ts:30`、`stores/server.ts:6`、`components/ui/AiJob.vue:310` 三处旧服务器地址为 `http://127.0.0.1:9100`
2. 删除 `Product.vue` / `AiJob.vue` 收款码渲染，以及 `Panel.vue` 购买/兑换菜单
3. `pnpm build` 重编译油猴脚本
4. 验证 `grep -c "43.138.246.37" ai-job-hunting.user.js` 为 `0`
5. 验证购买入口和 `qrCodeBase64` 相关产物已移除
6. 按 Task 10 安装 Vitest 并补 Panel/AiConfig 组件测试
7. 在根仓库提交并推送到 `https://github.com/fanly93/automatic_get_jobs.git`

---

## 10. 关键引用文档（Codex 按需查阅）

| 要了解什么 | 看哪里 |
|-----------|--------|
| **完整设计 spec**（目标/范围/改动清单/验收） | `docs/superpowers/specs/2026-06-24-ai-job-secondary-dev-design.md` |
| **完整实现计划**（12 任务逐步骤+代码） | `docs/superpowers/plans/2026-06-24-ai-job-secondary-dev.md` |
| **付费机制深度分析**（去付费原理、校验点、改法） | `reference_projects/ai-job-analysis/02-payment-and-model-integration.md` |
| **架构/技术栈/模块/功能** | `reference_projects/ai-job-analysis/03-architecture-and-tech-stack.md` |
| **安装使用**（部署命令、端到端步骤、坑） | `reference_projects/ai-job-analysis/01-installation-and-usage.md` |
| **总览 + 行动方案** | `reference_projects/ai-job-analysis/00-summary.md` |
| **两项目对比 + SSL 真相 + 选型** | `reference_projects/项目对比与选型建议.md` |

---

## 11. 关键文件位置（二次开发改动点）

**已改（Phase A-B）**：
- `ai-job-dev/ai-job-hunting-server/pom.xml` — Lombok + 删 javac 硬编码
- `ai-job-dev/.../mapper/UserProductMapper.java:22` — 去付费闸门1
- `ai-job-dev/.../frame/filter/ProductFilter.java:66` — 去付费闸门2
- `ai-job-dev/.../src/main/resources/application.properties:32-39` — Phase B MySQL 参数化 + SmartConfig 登录密码改为 `change-me-please`
- `ai-job-dev/.../src/main/resources/docker/Dockerfile` + `docker-compose.yml` — Phase B 后端+MySQL Docker Compose

**待改（Phase C-E）**：
- `ai-job-dev/.../config/AppBizConfig.java:35` — OCR 路由 `use-ai-map`（Phase D）
- `ai-job-dev/ai-job-hunting-ui/src/axios.ts:30`、`stores/server.ts:6`、`components/ui/AiJob.vue:310` — 旧服务器地址（Phase C）
- `ai-job-dev/ai-job-hunting-ui/src/components/ui/Panel.vue`、`Product.vue`、`AiJob.vue` — 收款码删除（Phase C）

---

## 12. ⚠️ 必读注意事项（避免重蹈覆辙）

### 12.1 所有 mvn 命令必须用 JDK 17
brew 装的 maven 默认用 JDK 26，Lombok 反射会失败（`TypeTag :: UNKNOWN`）。**必须**：
```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
# 或每条命令前带 JAVA_HOME=...
```
建议 Codex 第一次会话就把这行加进 `~/.zshrc` 永久化（用户上次未明确决定，可问）。

### 12.2 开发工作区是 `ai-job-dev/`，不是 `reference_projects/`
`reference_projects/` 是只读参考。所有改动在 `ai-job-dev/`。**不要碰 `reference_projects/`**。

### 12.3 commit 工作流：在根仓库提交才能同步 GitHub
- 根仓库 `AI-Job/` → push 到 GitHub
- `ai-job-dev/` 的本地 commit **不会**推到 GitHub
- 后续开发直接在 `AI-Job/` 根目录 `git add && commit && push`

### 12.4 SSL
- 本地部署（localhost）**不需要** SSL（loopback 豁免混合内容）
- 远程部署才需要 SSL（页面上下文 axios+EventSource 受混合内容约束）
- 当前目标本地部署，Phase B 不涉及 SSL

### 12.5 油猴脚本
- `ai-job-hunting.user.js` 是构建产物（1.6M），由 `ai-job-hunting-ui/` 用 `pnpm build` 生成
- 改前端源码后必须重编译（Phase C Task 6）
- 脚本运行在浏览器+Tampermonkey，**不能 Docker 化**

### 12.6 测试策略
- 项目原本无测试基建，本次新建
- 后端测试用 MockServer/WireMock 模拟 AI 端点，不真实调厂商（避免费用）
- 前端 Vitest + jsdom mock `GM_*` API
- 集成测试需 MySQL（Phase D 用 Phase B 的容器）

### 12.7 正确仓库路径
- 后续任务只在 `/Users/tanglin/VibeCoding/GetJobs/AI-Job/` 继续。
- 不要在 `/Users/tanglin/VibeCoding/AIStockMonitoring/` 下处理本项目。
- 误创建的 `/Users/tanglin/VibeCoding/AIStockMonitoring/automatic_get_jobs` 已删除。
- 根仓库里未跟踪的 `.claude/` 是用户本地配置，除非用户明确要求，不要纳入提交。

---

## 13. 给 Codex 的快速启动建议

1. **先读本文件**（你正在做）
2. **如需细节**，按需读第 10 节的引用文档（不要全读，按当前阶段需要）
3. **确认工作目录**：`/Users/tanglin/VibeCoding/GetJobs/AI-Job/`
4. **当前分支**：Phase B 产物在 `phase-b-docker-compose`，已推送到 GitHub
5. **下一步 Phase C**：按 `docs/superpowers/plans/2026-06-24-ai-job-secondary-dev.md` 的 Task 4/5/6/10 执行
6. **每个 mvn 命令带 `JAVA_HOME`**（见 12.1）
7. **完成后在根仓库 commit + push**
8. **每阶段结束停下汇报**，等用户确认再进下一阶段（用户的工作习惯）

---

*本文档由 Claude Code 生成，Codex 于 2026-06-28 按实际 Phase B 接手结果更新。*
