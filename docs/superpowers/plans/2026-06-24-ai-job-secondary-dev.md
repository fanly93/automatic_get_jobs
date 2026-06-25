# ai-job 二次开发实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `reference_projects/ai-job` 改造为自托管、免费、接入自有 OpenAI 兼容模型的 BOSS直聘 AI 自动投递/打招呼工具（Docker Compose 本地部署，零请求到作者旧服务器）。

**Architecture:** 定向改造既有项目，不改三段式架构（油猴脚本↔后端↔BOSS）。去付费靠双保险（mapper 恒返回 + ProductFilter 放行）；接自有模型用项目原生 UI（代码 0 改动）；收款码/旧服务器地址在 UI 源码清除后重编译油猴；后端+MySQL 容器化；新增全面测试套件。

**Tech Stack:** Java 17 / Spring Boot 3.2.5 / Spring AI / MyBatis-Plus / MySQL 8 / JUnit5+Mockito+MockMvc / Vue3+TS / Vite / Vitest / Docker Compose

**Spec:** `docs/superpowers/specs/2026-06-24-ai-job-secondary-dev-design.md`

**项目根目录**：`reference_projects/ai-job`（下文相对路径均相对此目录，除非以 `/` 开头表示项目根 `AI-Job`）

---

## 阶段组织 (Phases)

12 个任务按依赖关系划为 5 阶段，依赖链 **A → B → C → D → E**。每阶段结束停下汇报，等确认后再进入下一阶段。阶段内任务按"是否依赖/是否改同一文件"决定串行或并行（独立任务用并行 subagent，共享文件或依赖任务串行）。

| 阶段 | 任务 | 目标 | 依赖 | 阶段整体测试（超越 task TDD） |
|------|------|------|------|------------------------------|
| **A 后端去付费核心** | 1, 2, 3 | 去付费双保险，可编译 | 无 | 后端单测全绿 + `mvn clean compile` 通过 + phase 级整合测试（Mockito 构造无产品用户，验证 ProductFilter + AIServiceFacade 路径不抛 5001） |
| **B 部署容器化** | 7 | 后端+MySQL 在 Docker 跑起来 | A | 两容器 Up + MySQL healthcheck 通过 + `curl 127.0.0.1:9100` 非 000 + 6768 可达 + 密码已参数化 |
| **C 前端改造与重编译** | 4, 5, 6, 10 | 地址清除 + 收款码删除 + 重编译 + Vitest | 独立于 A/B | `grep 43.138.246.37` 零残留 + `grep qrCodeBase64` 购买入口已移除 + Vitest 全绿 + `pnpm build` 产出可用 |
| **D 后端功能与 API 级验证** | 8, 9, 11 | 集成测试 + OCR + curl 回归 | A, B, **C**(curl 的 grep 需前端已改) | MockMvc 集成测试全绿 + OCR 路由测试 + `verify.sh` 全绿 |
| **E BOSS 端到端验证** | 12 | 真实页面全流程 | 全部 | 油猴注入 BOSS、面板无购买/收款码、配置 DeepSeek、触发 AI 坐席、HR 收到回复、网络面板无旧服务器请求 |

> **OCR（Task 9）风险**：改走视觉模型依赖 `readFile` 支持图像，待 Phase D 验证。若不支持，停下汇报后据结果决定补多模态分支或降级。
> **Phase E 手动**：需浏览器 + 真实 BOSS 账号配合操作。

**全部阶段完成后**：制定完整测试套件（后端单测 + 集成测试 + 前端 Vitest + curl 脚本 + 端到端清单，五层），跑一遍完整流程测试。

---

## File Structure

**后端修改/新建**（`ai-job-hunting-server/src/main/java/com/maple/ai/job/hunting/`）：
- 修改 `mapper/UserProductMapper.java` — 去付费闸门 1
- 修改 `frame/filter/ProductFilter.java` — 去付费闸门 2
- 修改 `config/AppBizConfig.java` — OCR 路由（待 readFile 验证后定）
- 修改 `pom.xml:242` — 删硬编码 javac
- 修改 `src/main/resources/application.properties` — 密码/MySQL 参数化
- 修改 `src/main/resources/docker/Dockerfile` — 改官方基础镜像
- 修改 `src/main/resources/docker/docker-compose.yml` — 加 MySQL
- 新建测试：`src/test/java/.../mapper/UserProductMapperTest.java`、`.../frame/filter/ProductFilterTest.java`、`.../service/ai/AIServiceFacadeRoutingTest.java`、`.../AiJobApplicationIntegrationTest.java`

**前端修改**（`ai-job-hunting-ui/src/`）：
- 修改 `axios.ts:30`、`stores/server.ts:6`、`components/ui/AiJob.vue:310` — 旧服务器地址清除
- 修改 `components/ui/Panel.vue` — 移除购买/兑换菜单
- 修改 `components/ui/Product.vue`、`components/ui/AiJob.vue` — 删收款码渲染
- 新建 `vitest.config.ts`、`src/components/ui/__tests__/Panel.test.ts`、`AiConfig.test.ts`

**项目根**（`AI-Job/`）：
- 新建 `reference_projects/ai-job/verify.sh` — curl 接口回归脚本

---

## Task 1: 部署修复 — 删 pom.xml 硬编码 javac 路径

**Files:**
- Modify: `ai-job-hunting-server/pom.xml:241-246`

- [ ] **Step 1: 查看当前 maven-compiler-plugin 配置**

Run: `sed -n '235,250p' ai-job-hunting-server/pom.xml`

确认第 242 行有 `<executable>D:\Program Dev Kit\JDK\jdk-17.0.11+9\bin\javac.exe</executable>`。

- [ ] **Step 2: 删除硬编码 executable 配置**

把：
```xml
                <configuration>
                    <source>17</source>
                    <target>17</target>
                    <release>17</release>
                    <fork>true</fork>
                    <executable>D:\Program Dev Kit\JDK\jdk-17.0.11+9\bin\javac.exe</executable>
                </configuration>
```
改为：
```xml
                <configuration>
                    <source>17</source>
                    <target>17</target>
                    <release>17</release>
                </configuration>
```

- [ ] **Step 3: 验证编译通过**

Run: `cd ai-job-hunting-server && mvn clean compile -q`
Expected: BUILD SUCCESS（无 javac 路径错误）

- [ ] **Step 4: Commit**

```bash
cd ai-job-hunting-server
git add pom.xml
git commit -m "fix: 移除 pom.xml 硬编码的 Windows javac 路径

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: 去付费闸门 1 — UserProductMapper 恒返回全部套餐

**Files:**
- Modify: `ai-job-hunting-server/src/main/java/com/maple/ai/job/hunting/mapper/UserProductMapper.java:22-34`
- Test: `ai-job-hunting-server/src/test/java/com/maple/ai/job/hunting/mapper/UserProductMapperTest.java`

- [ ] **Step 1: 写失败测试**

Create `ai-job-hunting-server/src/test/java/com/maple/ai/job/hunting/mapper/UserProductMapperTest.java`:
```java
package com.maple.ai.job.hunting.mapper;

import com.maple.ai.job.hunting.emums.ProductTypeEnum;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserProductMapperTest {

    @Test
    void queryUserValidAllProductType_alwaysReturnsAllProductTypes_regardlessOfUser() {
        // 改造后：对所有用户恒返回全部 ProductTypeEnum
        UserProductMapper mapper = new TestUserProductMapper();
        Set<Integer> result = mapper.queryUserValidAllProductType(999L);
        Set<Integer> allCodes = Arrays.stream(ProductTypeEnum.values())
                .map(ProductTypeEnum::getCode)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        assertEquals(allCodes, result, "去付费后应恒返回全部产品能力");
        assertTrue(result.contains(ProductTypeEnum.AI_SEAT.getCode()));
        assertTrue(result.contains(ProductTypeEnum.CUSTOM_API.getCode()));
    }

    // 不依赖 DB 的测试用桩：default 方法可被空实现覆盖调用
    static class TestUserProductMapper implements UserProductMapper {}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-job-hunting-server && mvn test -Dtest=UserProductMapperTest -q`
Expected: FAIL（当前实现返回 emptySet，因为无 DB 数据）

- [ ] **Step 3: 改造 mapper 恒返回全部**

Modify `mapper/UserProductMapper.java` 的 `queryUserValidAllProductType` 方法体为：
```java
    default Set<Integer> queryUserValidAllProductType(Long userId) {
        // ===== 二次开发：关闭付费，所有产品能力对全部用户永久开放 =====
        return Arrays.stream(ProductTypeEnum.values())
                .map(ProductTypeEnum::getCode)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        // 原逻辑（注释保留）：
        // List<UserProductDO> userProductDOList = queryUserValidAllProduct(userId);
        // if (CollectionUtils.isEmpty(userProductDOList)) {
        //     return Collections.emptySet();
        // }
        // return userProductDOList.stream()
        //         .map(UserProductDO::getProductType)
        //         .map(JSON::parseArray)
        //         .flatMap(Collection::stream)
        //         .map((item -> (Integer) item))
        //         .collect(Collectors.toSet());
    }
```
确认顶部已有 `import java.util.*;` 和 `import ...ProductTypeEnum;`（已有，无需新增 import）。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd ai-job-hunting-server && mvn test -Dtest=UserProductMapperTest -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ai-job-hunting-server
git add src/main/java/com/maple/ai/job/hunting/mapper/UserProductMapper.java src/test/java/com/maple/ai/job/hunting/mapper/UserProductMapperTest.java
git commit -m "feat: 去付费闸门1 - UserProductMapper 恒返回全部产品能力

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: 去付费闸门 2 — ProductFilter 直接放行

**Files:**
- Modify: `ai-job-hunting-server/src/main/java/com/maple/ai/job/hunting/frame/filter/ProductFilter.java:66`
- Test: `ai-job-hunting-server/src/test/java/com/maple/ai/job/hunting/frame/filter/ProductFilterTest.java`

- [ ] **Step 1: 写失败测试**

Create `ai-job-hunting-server/src/test/java/com/maple/ai/job/hunting/frame/filter/ProductFilterTest.java`:
```java
package com.maple.ai.job.hunting.frame.filter;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProductFilterTest {

    @Test
    void doFilter_directlyPassesThrough_doesNotBlockAnyUrl() throws Exception {
        // 改造后：ProductFilter 首行直接放行，不再校验产品权限
        ProductFilter filter = new ProductFilter();
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/job/seeker/cloned/ask");
        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean[] chainCalled = {false};
        MockFilterChain chain = new MockFilterChain();
        chain = new MockFilterChain((req, res) -> chainCalled[0] = true);

        filter.doFilter(request, response, chain);

        assertTrue(chainCalled[0], "ProductFilter 应直接放行，调用 filterChain");
        assertEquals(200, response.getStatus());
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-job-hunting-server && mvn test -Dtest=ProductFilterTest -q`
Expected: FAIL（当前 doFilter 会走权限校验逻辑）

- [ ] **Step 3: 改造 ProductFilter 首行直接放行**

Modify `frame/filter/ProductFilter.java` 的 `doFilter` 方法，在方法体最开头加入放行：
```java
    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain) throws IOException, ServletException {
        // ===== 二次开发：关闭付费校验，直接放行所有请求 =====
        filterChain.doFilter(servletRequest, servletResponse);
        return;
        // 原逻辑（注释保留）：
        // HttpServletRequest request = (HttpServletRequest) servletRequest;
        // ...（原有全部权限校验代码保留注释）
    }
```
（仅插入前 3 行 + 注释原逻辑，不要删除原代码，注释保留以便回溯。）

- [ ] **Step 4: 运行测试确认通过**

Run: `cd ai-job-hunting-server && mvn test -Dtest=ProductFilterTest -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ai-job-hunting-server
git add src/main/java/com/maple/ai/job/hunting/frame/filter/ProductFilter.java src/test/java/com/maple/ai/job/hunting/frame/filter/ProductFilterTest.java
git commit -m "feat: 去付费闸门2 - ProductFilter 直接放行

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: 前端旧服务器地址清除

**Files:**
- Modify: `ai-job-hunting-ui/src/axios.ts:30`
- Modify: `ai-job-hunting-ui/src/stores/server.ts:6`
- Modify: `ai-job-hunting-ui/src/components/ui/AiJob.vue:310`

- [ ] **Step 1: 改 axios.ts 默认 baseURL**

Modify `ai-job-hunting-ui/src/axios.ts:30`，把：
```typescript
            req.baseURL = 'https://43.138.246.37/'
```
改为：
```typescript
            req.baseURL = 'http://127.0.0.1:9100'
```

- [ ] **Step 2: 改 server.ts 默认服务器地址常量**

Modify `ai-job-hunting-ui/src/stores/server.ts:6`，把：
```typescript
export const DEFAULT_SERVER_URL = 'https://43.138.246.37/'
```
改为：
```typescript
export const DEFAULT_SERVER_URL = 'http://127.0.0.1:9100'
```

- [ ] **Step 3: 改 AiJob.vue 容错默认地址**

Modify `ai-job-hunting-ui/src/components/ui/AiJob.vue:310`，把：
```typescript
        const DEFAULT_URL = 'https://43.138.246.37/';
```
改为：
```typescript
        const DEFAULT_URL = 'http://127.0.0.1:9100';
```

- [ ] **Step 4: grep 验证无旧服务器残留**

Run: `grep -rn "43.138.246.37" ai-job-hunting-ui/src`
Expected: 无输出（零残留）

- [ ] **Step 5: Commit**

```bash
cd ai-job-hunting-ui
git add src/axios.ts src/stores/server.ts src/components/ui/AiJob.vue
git commit -m "fix: 清除作者旧服务器地址，默认指向本地后端

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: 前端收款码 UI 与购买/兑换入口删除

**Files:**
- Modify: `ai-job-hunting-ui/src/components/ui/Panel.vue:25,42`
- Modify: `ai-job-hunting-ui/src/components/ui/Product.vue:64-95`
- Modify: `ai-job-hunting-ui/src/components/ui/AiJob.vue:179-210`
- Modify: `ai-job-hunting-ui/src/App.vue:3`

- [ ] **Step 1: 移除 Panel.vue 的邀请兑换菜单注册**

Modify `ai-job-hunting-ui/src/components/ui/Panel.vue`，删除：
```typescript
import InvitationExchange from "./InvitationExchange.vue";
```
和：
```typescript
componentMap.set('5', {component: InvitationExchange, name: '邀请兑换'});
```
（保留其余菜单项 1-4、6）

- [ ] **Step 2: 移除 Product.vue 的二维码渲染块**

Modify `ai-job-hunting-ui/src/components/ui/Product.vue`，删除 `<!--订单组二维码-->` 到 `</el-image>` 的整个二维码渲染块（约 64-95 行），保留组件其他部分。如果 Product.vue 仅用于购买（无其他用途），可直接在 App.vue 注释其引用。

- [ ] **Step 3: 移除 AiJob.vue 的二维码渲染块**

Modify `ai-job-hunting-ui/src/components/ui/AiJob.vue`，删除 `<!--订单组二维码-->` 到对应 `</el-image>` 的渲染块（约 179-210 行）及 `// 支付成功，清除之前的付款二维码` 相关逻辑。

- [ ] **Step 4: 注释 App.vue 的 Product 引用（若 Product.vue 已无其他用途）**

Modify `ai-job-hunting-ui/src/App.vue:3`，注释：
```typescript
// import Product from "./components/ui/Product.vue";
```
并在使用 Product 的地方（如 v-if/showProduct）改为不再渲染。保留组件文件不删，仅断开引用。

- [ ] **Step 5: 类型检查通过**

Run: `cd ai-job-hunting-ui && pnpm install && pnpm vue-tsc --noEmit`
Expected: 无类型错误（若有未使用 import 报错，清理对应 import）

- [ ] **Step 6: Commit**

```bash
cd ai-job-hunting-ui
git add src/components/ui/Panel.vue src/components/ui/Product.vue src/components/ui/AiJob.vue src/App.vue
git commit -m "feat: 删除收款码 UI 与购买/兑换入口

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: 重编译油猴脚本

**Files:**
- Build: `ai-job-hunting.user.js`

- [ ] **Step 1: 构建油猴脚本**

Run: `cd ai-job-hunting-ui && pnpm build`
Expected: 产出 `../ai-job-hunting.user.js`（更新后的脚本），无构建错误

- [ ] **Step 2: 验证产物无旧服务器地址**

Run: `grep -c "43.138.246.37" ai-job-hunting.user.js`
Expected: 0

- [ ] **Step 3: 验证产物无收款码相关**

Run: `grep -c "qrCodeBase64" ai-job-hunting.user.js`
Expected: 0（或仅剩无害的残留，确认购买入口已移除）

- [ ] **Step 4: Commit**

```bash
cd ai-job-hunting-ui
git add ../ai-job-hunting.user.js
git commit -m "build: 重编译油猴脚本（清除旧服务器地址与收款码 UI）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Docker Compose 部署编排

**Files:**
- Modify: `ai-job-hunting-server/src/main/resources/docker/Dockerfile`
- Modify: `ai-job-hunting-server/src/main/resources/docker/docker-compose.yml`
- Modify: `ai-job-hunting-server/src/main/resources/application.properties:32-33,36-39`

- [ ] **Step 1: 改造 Dockerfile 用官方基础镜像**

把 `ai-job-hunting-server/src/main/resources/docker/Dockerfile` 全文替换为：
```dockerfile
FROM eclipse-temurin:17-jre
WORKDIR /app/
COPY ./ai-job.jar /app/
EXPOSE 9100
EXPOSE 6768
ENTRYPOINT ["java", "-jar", "-XX:+StartAttachListener"]
CMD ["/app/ai-job.jar"]
```

- [ ] **Step 2: 参数化 application.properties**

Modify `application.properties`，把：
```properties
smart.username=admin
smart.password=123456
```
改为：
```properties
smart.username=${SMART_USERNAME:admin}
smart.password=${SMART_PASSWORD:change-me-please}
```
把：
```properties
spring.datasource.username=xxxx
spring.datasource.password=xxxx
spring.datasource.driverClassName=com.mysql.jdbc.Driver
spring.datasource.url=jdbc:mysql://${mysql.host:mysql}:3306/ai_job?useUnicode=true&characterEncoding=utf-8&serverTimezone=UTC&useSSL=false
```
改为：
```properties
spring.datasource.username=${MYSQL_USER:root}
spring.datasource.password=${MYSQL_PASSWORD:root}
spring.datasource.driverClassName=com.mysql.jdbc.Driver
spring.datasource.url=jdbc:mysql://${mysql.host:mysql}:3306/ai_job?useUnicode=true&characterEncoding=utf-8&serverTimezone=UTC&useSSL=false
```

- [ ] **Step 3: 改造 docker-compose.yml 加 MySQL**

把 `docker-compose.yml` 全文替换为：
```yaml
version: "3"
services:
  mysql:
    image: mysql:8.0
    container_name: ai-job-mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_PASSWORD:-root}
      MYSQL_DATABASE: ai_job
      TZ: Asia/Shanghai
    ports:
      - "3306:3306"
    volumes:
      - ai-job-mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${MYSQL_PASSWORD:-root}"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - ai-job-net

  ai-job:
    container_name: ai-job
    build:
      context: .
      dockerfile: Dockerfile
    depends_on:
      mysql:
        condition: service_healthy
    ports:
      - "9100:9100"
      - "6768:6768"
    volumes:
      - ai-job-logs:/app/logs
    environment:
      - TZ=Asia/Shanghai
      - mysql.host=mysql
      - MYSQL_USER=root
      - MYSQL_PASSWORD=${MYSQL_PASSWORD:-root}
      - SMART_USERNAME=${SMART_USERNAME:-admin}
      - SMART_PASSWORD=${SMART_PASSWORD:-change-me-please}
    command: '/app/ai-job.jar --smart.config.webui.port=6768 --smart.config.desc.infer=true'
    networks:
      - ai-job-net

# 远程部署 SSL 扩展（本地不需要）：在前置 nginx 反代 9100，配证书，把油猴脚本默认地址改 https://你的域名
volumes:
  ai-job-mysql-data:
  ai-job-logs:

networks:
  ai-job-net:
```

- [ ] **Step 4: 打包 jar**

Run: `cd ai-job-hunting-server && mvn clean package -DskipTests -q`
Expected: 产出 `target/ai-job.jar`

- [ ] **Step 5: 复制 jar 到 docker 目录并构建**

Run:
```bash
cd ai-job-hunting-server
cp target/ai-job.jar src/main/resources/docker/ai-job.jar
cd src/main/resources/docker
docker compose build
```
Expected: 镜像构建成功

- [ ] **Step 6: 启动并验证**

Run: `cd ai-job-hunting-server/src/main/resources/docker && docker compose up -d`
Expected: 两个容器启动，MySQL healthcheck 通过后 ai-job 启动

Run: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9100/`
Expected: 返回非 000（服务可达，可能是 404/401 都算启动成功）

- [ ] **Step 7: Commit**

```bash
cd ai-job-hunting-server
git add src/main/resources/docker/Dockerfile src/main/resources/docker/docker-compose.yml src/main/resources/application.properties
git commit -m "feat: Docker Compose 编排（后端+MySQL）+ 参数化配置

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: 后端集成测试 — 去付费与模型路由

**Files:**
- Create: `ai-job-hunting-server/src/test/java/com/maple/ai/job/hunting/AiJobApplicationIntegrationTest.java`

- [ ] **Step 1: 写集成测试（MockMvc 验证无 5001）**

Create `ai-job-hunting-server/src/test/java/com/maple/ai/job/hunting/AiJobApplicationIntegrationTest.java`:
```java
package com.maple.ai.job.hunting;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class AiJobApplicationIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void askEndpoint_doesNotReturnProductNotAuthorized_5001() throws Exception {
        // 改造后：未购买账号调用 AI 坐席不再被 ProductFilter 拦截返回 5001
        // （可能因缺少登录态返回 401，但绝不应是 5001 产品未授权）
        mockMvc.perform(post("/api/job/seeker/cloned/ask"))
                .andExpect(result -> {
                    String body = result.getResponse().getContentAsString();
                    // 不应包含产品未授权码 5001
                    assert !body.contains("\"code\":5001") : "不应返回产品未授权 5001";
                });
    }

    @Test
    void saveAiConfig_doesNotRequireCustomApiProduct() throws Exception {
        // 改造后：保存自有模型配置不再需要 CUSTOM_API 产品能力
        mockMvc.perform(post("/api/user/ai/config/save"))
                .andExpect(result -> {
                    String body = result.getResponse().getContentAsString();
                    assert !body.contains("\"code\":5001") : "保存 AI 配置不应返回 5001";
                });
    }
}
```

- [ ] **Step 2: 运行集成测试**

Run: `cd ai-job-hunting-server && mvn test -Dtest=AiJobApplicationIntegrationTest -q`
Expected: PASS（两个测试都不应触发 5001）

> 注意：集成测试需要 MySQL，若 CI 无 MySQL，用 Testcontainers 或 `@MockBean` mock 掉 mapper 层。本地跑用 Task 7 的 MySQL 容器。

- [ ] **Step 3: Commit**

```bash
cd ai-job-hunting-server
git add src/test/java/com/maple/ai/job/hunting/AiJobApplicationIntegrationTest.java
git commit -m "test: 集成测试验证去付费后无 5001

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: OCR 路由改造（待 readFile 验证）

**Files:**
- Verify: `ai-job-hunting-server/src/main/java/com/maple/ai/job/hunting/service/ai/impl/OpenAIPoolService.java`
- Verify: `ai-job-hunting-server/src/main/java/com/maple/ai/job/hunting/service/ai/AIServiceFacade.java:158`
- Modify: `ai-job-hunting-server/src/main/java/com/maple/ai/job/hunting/config/AppBizConfig.java:35`

- [ ] **Step 1: 验证 OpenAIPoolService.readFile 是否支持图像**

Run: `grep -n "readFile\|UserMessage\|Media\|image\|IMAGE" ai-job-hunting-server/src/main/java/com/maple/ai/job/hunting/service/ai/impl/OpenAIPoolService.java ai-job-hunting-server/src/main/java/com/maple/ai/job/hunting/service/ai/AbstractAIService.java 2>/dev/null`

判断：若 `readFile` 构造了 `Media`/`image` 的 UserMessage → 支持图像，继续 Step 2。若只构造文本 → 不支持，需补多模态分支（见 Step 3）。

- [ ] **Step 2: 改 use-ai-map 路由 file 走用户级/池**

若 readFile 支持图像，Modify `AppBizConfig.java`，把默认值：
```
"use-ai-map":{"ask":"openai-pool","session":"openai-pool","file":"kimi"}
```
改为：
```
"use-ai-map":{"ask":"openai-pool","session":"openai-pool","file":"openai-pool"}
```
（让 OCR 走服务端池中的视觉模型；用户级视觉模型经 AiConfig 面板配置后由 CustomOpenAIService 处理，路由逻辑需确认 AIServiceFacade.readFile 能命中——若不命中则需在 readFile 增加用户级配置判断）

- [ ] **Step 3: 若 readFile 不支持图像，补多模态分支**

在 `OpenAIPoolService.readFile`（或新增 `CustomOpenAIService.readFile`）中，构造含图像的 UserMessage：
```java
// 伪代码：用 Spring AI 的 Media 构造图像消息
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.messages.Media;
import org.springframework.util.MimeTypeUtils;

UserMessage userMessage = new UserMessage(prompt,
    new Media(MimeTypeUtils.IMAGE_PNG, imageResource));
```
（具体实现需读现有 readFile 结构后对齐，此步为条件性，仅在 Step 1 判定不支持时执行）

- [ ] **Step 4: 写 OCR 路由测试**

Create `ai-job-hunting-server/src/test/java/com/maple/ai/job/hunting/service/ai/OcrRoutingTest.java`:
```java
package com.maple.ai.job.hunting.service.ai;

import com.maple.ai.job.hunting.config.AppBizConfig;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class OcrRoutingTest {

    @Test
    void fileScene_doesNotRouteToKimi() {
        AppBizConfig config = new AppBizConfig();
        // 改造后：file 场景不再走 kimi
        assertNotEquals("kimi", config.getSceneUseAiMap().get("file"),
                "OCR 应改走 openai-pool/用户级视觉模型，不再走 kimi");
    }
}
```

- [ ] **Step 5: 运行测试**

Run: `cd ai-job-hunting-server && mvn test -Dtest=OcrRoutingTest -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd ai-job-hunting-server
git add src/main/java/com/maple/ai/job/hunting/config/AppBizConfig.java src/main/java/com/maple/ai/job/hunting/service/ai/impl/OpenAIPoolService.java src/test/java/com/maple/ai/job/hunting/service/ai/OcrRoutingTest.java
git commit -m "feat: OCR 路由改走视觉模型（待 readFile 验证）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: 前端 Vitest 组件测试

**Files:**
- Create: `ai-job-hunting-ui/vitest.config.ts`
- Create: `ai-job-hunting-ui/src/components/ui/__tests__/Panel.test.ts`
- Create: `ai-job-hunting-ui/src/components/ui/__tests__/AiConfig.test.ts`

- [ ] **Step 1: 安装 vitest 依赖**

Run: `cd ai-job-hunting-ui && pnpm add -D vitest @vue/test-utils jsdom @vitest/coverage-v8`
Expected: 安装成功

- [ ] **Step 2: 创建 vitest 配置**

Create `ai-job-hunting-ui/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

- [ ] **Step 3: 写 Panel 测试（验证无邀请兑换入口）**

Create `ai-job-hunting-ui/src/components/ui/__tests__/Panel.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// mock GM_ API（油猴环境）
vi.mock('../../platform/utils', () => ({
  TampermonkeyApi: {
    GmGetValue: () => 'http://127.0.0.1:9100',
    GmSetValue: () => {},
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
}))

import Panel from '../Panel.vue'

describe('Panel', () => {
  it('不再注册邀请兑换菜单项', () => {
    const wrapper = mount(Panel, { global: { stubs: ['el-menu', 'el-menu-item'] } })
    const html = wrapper.html()
    expect(html).not.toContain('邀请兑换')
  })
})
```

- [ ] **Step 4: 写 AiConfig 测试**

Create `ai-job-hunting-ui/src/components/ui/__tests__/AiConfig.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../platform/utils', () => ({
  TampermonkeyApi: { GmGetValue: () => '', GmSetValue: () => {} },
}))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn() } }))

import AiConfig from '../AiConfig.vue'
import { mount } from '@vue/test-utils'

describe('AiConfig', () => {
  it('默认服务器地址不再是作者旧服务器', async () => {
    // 改造后：DEFAULT_SERVER_URL 不应是 43.138.246.37
    const serverModule = await import('../../stores/server')
    expect(serverModule.DEFAULT_SERVER_URL).toBe('http://127.0.0.1:9100')
    expect(serverModule.DEFAULT_SERVER_URL).not.toContain('43.138.246.37')
  })
})
```

- [ ] **Step 5: 运行前端测试**

Run: `cd ai-job-hunting-ui && pnpm vitest run`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
cd ai-job-hunting-ui
git add vitest.config.ts src/components/ui/__tests__/ package.json pnpm-lock.yaml
git commit -m "test: 前端 Vitest 组件测试（无购买入口、地址清除）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: curl 接口回归脚本

**Files:**
- Create: `reference_projects/ai-job/verify.sh`

- [ ] **Step 1: 创建回归脚本**

Create `reference_projects/ai-job/verify.sh`:
```bash
#!/bin/bash
# ai-job 二次开发接口回归脚本
# 前置：docker compose up -d 后端已启动
BASE=http://127.0.0.1:9100
PASS=0; FAIL=0

check() {
  local name="$1" cmd="$2" expect="$3"
  result=$(eval "$cmd" 2>&1)
  if echo "$result" | grep -q "$expect"; then
    echo "✅ $name"; PASS=$((PASS+1))
  else
    echo "❌ $name (期望含 '$expect')"; echo "   实际: $result"; FAIL=$((FAIL+1))
  fi
}

check "后端可达" \
  "curl -s -o /dev/null -w '%{http_code}' $BASE/" \
  -v 2>/dev/null; # curl -w 只输出状态码

check "AI坐席不返5001" \
  "curl -s -X POST $BASE/api/job/seeker/cloned/ask" \
  "5001"; 
# 注意：含5001则FAIL，用反向逻辑
if curl -s -X POST $BASE/api/job/seeker/cloned/ask | grep -q '"code":5001'; then
  echo "❌ AI坐席返回5001产品未授权"; FAIL=$((FAIL+1))
else
  echo "✅ AI坐席无5001"; PASS=$((PASS+1))
fi

if curl -s -X POST $BASE/api/user/ai/config/save | grep -q '"code":5001'; then
  echo "❌ 保存AI配置返回5001"; FAIL=$((FAIL+1))
else
  echo "✅ 保存AI配置无5001"; PASS=$((PASS+1))
fi

# 旧服务器零请求（grep 源码）
if grep -rn "43.138.246.37" ai-job-hunting-ui/src ai-job-hunting.user.js 2>/dev/null | grep -v "^Binary"; then
  echo "❌ 仍有旧服务器地址残留"; FAIL=$((FAIL+1))
else
  echo "✅ 旧服务器地址已清除"; PASS=$((PASS+1))
fi

echo "---"; echo "通过: $PASS  失败: $FAIL"
[ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: 赋权并运行**

Run: `cd reference_projects/ai-job && chmod +x verify.sh && ./verify.sh`
Expected: 全部 ✅，失败为 0

- [ ] **Step 3: Commit**

```bash
cd reference_projects/ai-job
git add verify.sh
git commit -m "test: curl 接口回归脚本

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 12: BOSS 端到端验证

**Files:** 无（手动验证）

- [ ] **Step 1: 确保后端运行**

Run: `cd reference_projects/ai-job/ai-job-hunting-server/src/main/resources/docker && docker compose ps`
Expected: ai-job 和 mysql 均 Up

- [ ] **Step 2: 安装油猴脚本**

在浏览器 Tampermonkey 中导入 `reference_projects/ai-job/ai-job-hunting.user.js`。打开 BOSS直聘 `https://www.zhipin.com/`，确认右下角出现 AI 助手面板。

- [ ] **Step 3: 验证无收款码/购买入口**

在 AI 助手面板检查菜单：应只有 AI助手/偏好设置/运行记录/AI配置/使用文档，**无购买/邀请兑换**。全程不出现支付宝二维码。

- [ ] **Step 4: 配置自有模型并验证**

在「AI 配置」面板：提供商选 DeepSeek → baseUrl 自动填 `https://api.deepseek.com/v1` → 模型 `deepseek-chat` → 填 apiKey → 点测试 → 保存 → 打开「启用自有API」开关。

- [ ] **Step 5: 触发 AI 坐席对话验证**

在 BOSS 与 HR 沟通时，确认后端日志走 `CustomOpenAIService`、AI 生成招呼语/回复正常。检查浏览器网络面板：**无对 `43.138.246.37` 的请求**。

- [ ] **Step 6: 跑 curl 回归脚本**

Run: `cd reference_projects/ai-job && ./verify.sh`
Expected: 全绿

- [ ] **Step 7: Commit 验证记录**

```bash
cd reference_projects/ai-job
git commit --allow-empty -m "chore: 阶段一 BOSS 端到端验证通过

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 验收对照（对应 spec 第 4 节）

| spec 验收项 | 对应 Task |
|-------------|----------|
| A. 旧服务器零请求 | Task 4 + Task 6(构建验证) + Task 11(grep) + Task 12(网络面板) |
| B. 收款码零弹出 | Task 5 + Task 12 |
| C. 去付费生效 | Task 2+3 + Task 8(集成测试) + Task 11(curl) |
| D. 接自有模型 | Task 4(地址) + Task 8 + Task 12(配置+触发) |
| E. OCR | Task 9 |
| F. 部署 | Task 1+7 |
| G. 测试套件全绿 | Task 2+3+8+9+10+11 |
| H. BOSS 端到端 | Task 12 |
