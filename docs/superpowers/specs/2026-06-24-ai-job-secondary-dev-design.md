# ai-job 二次开发设计文档

> - **日期**：2026-06-24
> - **被改造项目**：`reference_projects/ai-job`（gitee: yangfeng20/ai-job）
> - **文档定位**：基于 superpowers brainstorming 流程产出的设计 spec，作为后续 writing-plans 实现计划的依据
> - **探索依据**：`reference_projects/ai-job-analysis/`（00 总览 / 01 安装使用 / 02 付费与模型 / 03 架构技术）+ `项目对比与选型建议.md`

---

## 1. 目标

把 `reference_projects/ai-job` 二次开发成一个**自托管、免费、接入自有 OpenAI 兼容模型**的 BOSS直聘 AI 自动投递/打招呼工具：

- **免费**：彻底移除付费机制（支付宝收款码、产品授权、试用、邀请兑换），自己使用不再弹出任何收款码
- **接入自有模型**：只需在 UI 面板设置 `base_url + api_key + model`，即可接入 DeepSeek / 通义 DashScope / OpenAI 等任意 OpenAI 兼容模型
- **自托管**：后端 + MySQL 用 Docker Compose 本地部署，**绝不向作者旧服务器（`43.138.246.37`）发送任何请求**
- **可扩展**：架构上预留远程部署（SSL/域名）路径

项目本身能力（AI 生成招呼语、Hook BOSS WebSocket 自动回复 HR、批量投递、AI 岗位筛选）保持不变，本次只做定向改造。

---

## 2. 范围

### In-scope（阶段一，本 spec 主交付）

1. **去付费双保险**：改 `UserProductMapper.queryUserValidAllProductType` 恒返回全部套餐 + `ProductFilter.doFilter` 首行直接放行
2. **收款码逻辑彻底删除**：移除 `Product.vue`/`AiJob.vue` 二维码渲染、`Panel.vue` 菜单入口、5001 拦截器购买框触发（UI 源码改动，需重编译油猴脚本）
3. **旧服务器地址清除**：改 `axios.ts:30`/`stores/server.ts:6`/`AiJob.vue:310` 三处默认值为本地地址，杜绝任何对 `43.138.246.37` 的请求
4. **接自有模型**：用户级 UI 面板配置（`user_ai_config` 表），代码 0 改动（项目已支持），文档化配置步骤
5. **OCR 改走用户级视觉模型**：改 `use-ai-map` 路由 `"file"` 从 `kimi` → 用户级配置路径，验证 `readFile` 支持图像
6. **部署编排**：改造已有 Dockerfile/docker-compose，后端+MySQL 容器化，参数化配置，改 SmartConfig 默认密码
7. **部署修复**：删 `pom.xml:242` 硬编码 javac 路径、MySQL 配置
8. **新增测试套件（全面覆盖）**：后端单测（JUnit5+Mockito）+ 后端集成测试（MockMvc+MockServer）+ 前端组件测试（Vitest）+ curl 接口回归脚本

### Out-of-scope（明确不做）

- **流式输出改造**：AI 对话保持非流式（已够用）
- **多账号管理**：项目本就单浏览器单用户
- **智联/前程无忧等其他平台适配**：仅 BOSS直聘
- **阶段二：删付费死代码与表**（`ALiPayController/Service`、`UserInvitesController`、`user_trial`/`user_invites`/`user_product` 表）：因有连锁依赖风险（`AIServiceFacade` 引用 `productPowerList`），列为后续阶段，先靠双保险让付费代码成为不被调用的死代码
- **通义服务端池运营方 key 填实**：改走用户级配置，不依赖服务端池

### Docker 化边界（重要约束）

| 组件 | Docker 化 | 理由 |
|------|-----------|------|
| 后端 Java 服务 | ✅ 是 | 已有 Dockerfile，JDK17，暴露 9100(业务)/6768(SmartConfig) |
| MySQL | ✅ 是 | 标准镜像，已有 `${mysql.host}` 占位 |
| 油猴脚本 | ❌ 否 | 本质是注入 BOSS 网页的代码，运行在本地浏览器+Tampermonkey，依赖浏览器环境（Hook BOSS WebSocket、操作 DOM）。Docker 无浏览器，无法运行。它是 `pnpm build` 产出的构建产物，非运行进程 |
| 前端 ui 工程 | ❌ 否(不需) | 仅用于构建油猴脚本的源码工程，构建后使命完成，非运行进程 |

> 即：Docker 跑后端+MySQL；油猴脚本装在本地浏览器，指向 Docker 里的后端。这是架构本质决定的。

---

## 3. 架构与组件改动

整体三段式架构（油猴脚本↔后端↔BOSS）不变，只做定向改造。

### 3.1 后端 Java 改造（`ai-job-hunting-server`）

| 改动 | 文件 | 内容 |
|------|------|------|
| 去付费闸门 1 | `mapper/UserProductMapper.java:22` | `queryUserValidAllProductType` 恒返回全部 `ProductTypeEnum` code（注释保留原逻辑） |
| 去付费闸门 2 | `frame/filter/ProductFilter.java:66` | `doFilter` 首行直接 `filterChain.doFilter(request, response); return;` |
| OCR 路由 | `config/AppBizConfig.java:35` | `use-ai-map` 的 `"file"` 从 `kimi` → 用户级/自定义视觉模型路径 |
| OCR 实现（待验证） | `service/ai/impl/OpenAIPoolService.java` 或 `AIServiceFacade.readFile` | 确认 `readFile` 支持图像 message；不支持则补多模态分支；确认路由能否指向用户级 CustomOpenAIService |
| 构建修复 | `pom.xml:242` | 删硬编码 `javac.exe` 路径 |
| 安全 | `application.properties:32-33` | SmartConfig 密码 `admin/123456` → 环境变量 `${SMART_CONFIG_PASSWORD}` 注入 |
| 旧服务器清理 | `application.properties:26` | `alipay.notify_url` 占位保留（不用支付即无效），无需改动 |

### 3.2 前端源码改造（`ai-job-hunting-ui`，需 `pnpm build` 重编译）

| 改动 | 文件 | 内容 |
|------|------|------|
| 旧服务器地址清除 1 | `src/axios.ts:30` | 默认 baseURL `'https://43.138.246.37/'` → `'http://127.0.0.1:9100'` |
| 旧服务器地址清除 2 | `src/stores/server.ts:6` | `DEFAULT_SERVER_URL` → `'http://127.0.0.1:9100'` |
| 旧服务器地址清除 3 | `src/components/ui/AiJob.vue:310` | `DEFAULT_URL` → `'http://127.0.0.1:9100'` |
| 移除购买菜单入口 | `src/components/ui/Panel.vue` | 注释 Product 路由注册 + InvitationExchange（`componentMap`） |
| 删除收款码渲染 1 | `src/components/ui/Product.vue:88` | 移除 `order.qrCodeBase64` 二维码渲染块 |
| 删除收款码渲染 2 | `src/components/ui/AiJob.vue:203` | 移除 `order.qrCodeBase64` 二维码渲染块 |
| 5001 拦截器 | `src` axios 响应拦截（编译产物 `ai-job-hunting.user.js:2928`） | 双保险后后端不返 5001，购买框触发逻辑可保留无害或一并移除（标为可选清理） |

### 3.3 部署编排（改造已有 + 新增）

- 改造 `ai-job-hunting-server/src/main/resources/docker/Dockerfile`：基础镜像 `maple20/jdk17_env:1.0` → 官方 `eclipse-temurin:17-jre`（避免依赖作者私有镜像）
- 改造 `docker-compose.yml`：加 MySQL 服务（`mysql:8.0`）、healthcheck、依赖顺序、参数化环境变量、删除 `external` 网络依赖（改为本地网络）
- `application.properties`：MySQL 地址/密码、SmartConfig 密码等用 `${ENV}` 占位
- 后端地址参数化：油猴脚本默认指向本地 `http://127.0.0.1:9100`（见 3.2），为远程扩展预留 compose 注释块给 SSL 反代示例

### 3.4 改造后数据流（自有模型场景）

```
油猴面板填 base_url/api_key/model
  → /api/user/ai/config/save (双保险后放行，不再需 CUSTOM_API)
  → 落 user_ai_config 表，启用自有API
HR 来消息 → /api/job/seeker/cloned/ask → AIServiceFacade.sessionChat
  → 命中 getEnabledConfig → CustomOpenAIService
  → CompletionPathOpenAiApi 非流式 POST {你的base_url}/chat/completions
简历图片 → AIServiceFacade.readFile → 走用户级视觉模型 (改造后)
```

**组件边界**：改动集中在少量文件，每点独立可测——mapper 改动可单独 curl 验证（无 5001），地址清除可单独 grep 验证，UI 改动可单独验证（无购买入口/收款码），OCR 改动可单独验证（图片解析）。

---

## 4. 分阶段交付与验收

### 阶段一交付物

1. 后端去付费双保险（mapper + ProductFilter）
2. 收款码逻辑彻底删除（UI 源码 + 重编译油猴）
3. 旧服务器地址清除（3 处默认值 + grep 验证无残留）
4. 接自有模型（用户级 UI，代码 0 改动，文档化）
5. OCR 改走用户级视觉模型（含 readFile 验证）
6. Docker Compose 部署编排 + 部署修复
7. 测试套件（全面覆盖）

### 验收标准

**A. 旧服务器零请求（硬性安全边界）**
- ✅ `grep -rn "43.138.246.37" reference_projects/ai-job`（排除 `.git`/`node_modules`）无残留
- ✅ 油猴脚本运行时不向 `43.138.246.37` 发任何请求（浏览器网络面板验证）

**B. 收款码零弹出**
- ✅ BOSS 页面面板无购买菜单、无邀请兑换入口
- ✅ 全程不出现支付宝二维码/收款码

**C. 去付费生效（API 级，curl）**
- ✅ 未购买账号调 `/api/job/seeker/cloned/ask` → 不返 5001，正常走 AI
- ✅ SmartConfig 动态下发新 URL 也放行（ProductFilter 兜底）

**D. 接自有模型（API 级 + BOSS 端到端）**
- ✅ `/api/user/ai/config/save` 放行 → 能保存配置（填 DeepSeek 测试→保存→启用）
- ✅ 启用自有 API 后调 `/api/job/seeker/cloned/ask` → 后端日志走 `CustomOpenAIService`，请求落到你配置的 base_url（用 MockServer 验证 + 浏览器实际验证）
- ✅ 关闭自有 API → 回退服务端池（池配成你的模型，无占位 key 报错）

**E. OCR（API 级）**
- ✅ 图片简历 OCR → 走用户级视觉模型，返回解析结果（readFile 验证通过为前提）

**F. 部署**
- ✅ `docker compose up` 后端+MySQL 正常启动，9100/6768 可访问
- ✅ SmartConfig 密码已改（非 admin/123456）

**G. 测试套件全绿**
- ✅ 后端单测：mapper 恒返回、ProductFilter 放行、AIServiceFacade 模型路由、OCR 路由
- ✅ 后端集成测试（MockMvc）：核心接口无 5001、走 CustomOpenAIService（MockServer 拦截 AI 端点）
- ✅ 前端 Vitest：ViewRouter 不注册 Product/InvitationExchange、AiConfig 表单交互、5001 拦截器行为
- ✅ curl 回归脚本 `verify.sh` 全通过

**H. BOSS 端到端**
- ✅ 油猴脚本指向本地后端，触发 AI 坐席对话，HR 收到 AI 生成招呼语/回复
- ✅ 批量投递/打招呼正常，无付费拦截

### 阶段二（记录为后续，非本 spec 验收项）

- 删 ALiPayController/Service、UserInvitesController、user_trial/user_invites/user_product 表
- 前置：排查并修复 AIServiceFacade（productPowerList）、ProductFilter 等连锁依赖
- 验收：编译通过、API 级全量回归无 5001、死代码已清、测试套件作回归基线保护

---

## 5. 测试套件

- **后端单元测试**（JUnit5 + Mockito）：
  - `UserProductMapper.queryUserValidAllProductType` 恒返回全部 code
  - `ProductFilter.doFilter` 直接放行
  - `AIServiceFacade` 模型路由（有自有配置→CustomOpenAIService，否则→池）
  - OCR 路由选择（file→用户级视觉模型）
- **后端集成测试**（MockMvc + `@SpringBootTest`）：
  - `/api/job/seeker/cloned/ask` 无 5001
  - `/api/user/ai/config/save` 放行
  - 启用自有 API 后走 CustomOpenAIService（用 MockServer/WireMock 拦截 AI 端点，验证请求落到配置的 base_url）
- **前端组件测试**（Vitest + jsdom）：
  - `ViewRouter`/`Panel` 不再注册 Product/InvitationExchange
  - `AiConfig` 表单交互（填配置→测试→保存）
  - 5001 拦截器行为（双保险后不弹购买框）
  - Mock `GM_*` API
- **curl 接口回归脚本**（`verify.sh`）：固化 A/B/C/D/E 项检查，可重复跑

**测试技术选型**：后端用 MockServer/WireMock 模拟 OpenAI 兼容端点（不真实调 AI 厂商，避免费用/网络依赖）；前端 Vitest+jsdom mock `GM_*`。不追求全量覆盖，聚焦改造点与核心路径。

---

## 6. 错误处理与降级

- **OCR 视觉模型不可用**（模型无视觉能力 / readFile 不支持图像）→ 文字简历与核心打招呼/投递功能不受影响，OCR 返回明确错误提示
- **自有模型调用失败**（超时/401）→ 沿用项目原有异常处理（`AIConfigHelper` 超时 + 错误码），UI 显示测试失败
- **油猴重编译失败**→ 保留原 `.user.js` 作回退（后端已放行，UI 入口仍在但无害；但旧服务器地址清除依赖重编译，故重编译失败时需手动改已安装脚本的默认地址）

---

## 7. 风险与开放问题

| 风险 | 等级 | 应对 |
|------|------|------|
| OCR `readFile` 不支持图像 message | 高 | 阶段一先验证，不支持则补多模态分支；模型无视觉能力则 OCR 降级，不影响核心功能 |
| 油猴脚本重编译（35K 行 + vite-plugin-monkey + CDN externalGlobals）环境问题 | 高 | 先验证 `pnpm build` 能产出可用 `.user.js`，失败则保留原脚本+手动改默认地址 |
| `pom.xml:242` 删硬编码后 Maven 编译失败 | 中 | 删除后 `mvn clean compile` 验证，必要时调整 plugin 配置 |
| Docker Compose 后端连不上 MySQL / SmartConfig 端口暴露 | 中 | healthcheck + 依赖顺序；SmartConfig 改密码且仅本地映射 |
| 阶段二删表破坏 AIServiceFacade 等连锁依赖 | 中 | 阶段二前置：测试套件跑全量回归定位破坏点，逐个修复 |
| 基础镜像 `maple20/jdk17_env:1.0` 是作者私有镜像可能拉不到 | 中 | 改用官方 `eclipse-temurin:17-jre` |

**开放问题（待验证/决策）：**
1. OCR 走用户级视觉模型时，`AIServiceFacade.readFile` 如何区分"用户级配置"与"服务端池"——现状按 `use-ai-map` 的 `"file"` 路由取 KimiAIService，改走用户级需确认路由能否指向 CustomOpenAIService（可能需改路由逻辑，非纯配置）
2. 前端 5001 拦截器是保留无害还是一并清理——倾向保留（双保险后不触发），标为可选
3. 通义服务端池是否保留作兜底——倾向保留但配成你的模型，避免占位 key 报错

---

## 8. 实现顺序（阶段一）

1. 部署修复 + Docker Compose：删 pom 硬编码、改造 Dockerfile/compose、配 MySQL、改密码 → 验证后端能启动
2. 去付费双保险：mapper + ProductFilter → curl 验证无 5001
3. 旧服务器地址清除：改 3 处默认值 → grep 验证无残留
4. 收款码 UI 删除 + 油猴重编译 → 验证无购买入口/收款码、构建产出可用
5. 接自有模型（UI 配置，0 改动）→ curl 验证走 CustomOpenAIService
6. OCR 路由改造 + readFile 验证 → curl 验证图片解析
7. 测试套件（JUnit5/MockMvc/Vitest/curl）→ 全绿
8. BOSS 端到端验证

**关键不变量（实现全程必须保持）：**
- 后端不返 5001（去付费生效）
- 启用自有 API 后 AI 请求落到用户配置的 base_url（不依赖作者/运营方）
- 不向 `43.138.246.37` 发任何请求
- 全程不出现收款码

---

## 9. 关键文件清单（绝对路径）

**后端**（`reference_projects/ai-job/ai-job-hunting-server/src/main/java/com/maple/ai/job/hunting/`）：
- 去付费闸门：`mapper/UserProductMapper.java`、`frame/filter/ProductFilter.java`
- OCR 路由：`config/AppBizConfig.java`、`service/ai/AIServiceFacade.java`、`service/ai/impl/OpenAIPoolService.java`
- 构建修复：`pom.xml`
- 配置：`src/main/resources/application.properties`、`src/main/resources/docker/Dockerfile`、`src/main/resources/docker/docker-compose.yml`

**前端**（`reference_projects/ai-job/ai-job-hunting-ui/src/`）：
- 旧服务器地址：`axios.ts`、`stores/server.ts`、`components/ui/AiJob.vue`
- 收款码/购买入口：`components/ui/Product.vue`、`components/ui/AiJob.vue`、`components/ui/Panel.vue`、`components/ui/InvitationExchange.vue`、`App.vue`、`ViewRouter.vue`

---

*本 spec 基于 reference_projects 落盘分析文档 + superpowers brainstorming 流程（逐一提问澄清）生成。所有改动点均附文件:行号引用，可追溯。*
