# Phase E DOM-Safe Mount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the BOSS jobs-page assistant from being mounted as a direct `document.body` child while preserving the fixed floating panel user experience.

**Architecture:** Keep one Vue singleton and the existing recovery observer, but change the jobs-page host from `document.body` to a stable BOSS page container. `floating` remains a visual mode only; the actual DOM parent becomes `containerEle`. This reduces coupling with BOSS's body-level `iframe[name=zhipinFrame]` safe-gateway lifecycle documented in `docs/phase-e/boss-jobs-dom-cycle-root-cause.md`.

**Tech Stack:** Vue 3, TypeScript, Vitest source regression tests, Vite userscript build, Tampermonkey userscript artifact.

---

## File Map

- Modify `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PaymentCleanup.test.ts`
  - Replace the old body-level floating assertion with a DOM-safe mount regression test.
- Modify `ai-job-dev/ai-job-hunting-ui/src/platform/platform.ts`
  - Add a jobs-page host selector helper.
  - Return that host for `/web/geek/jobs` instead of `document.body`.
- Modify `ai-job-dev/ai-job-hunting-ui/src/main.ts`
  - Append `floating` roots to `containerEle`, not `currentBody`.
  - Keep the `currentBody` guard only for page availability and removal detection.
- Modify `ai-job-dev/ai-job-hunting.user.js`
  - Copy from `ai-job-dev/ai-job-hunting-ui/dist/ai-job-hunting.user.js` after build.

## Task 1: Lock DOM-Safe Jobs Mount With Failing Test

**Files:**
- Modify: `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PaymentCleanup.test.ts`

- [ ] **Step 1: Replace the body-level jobs mount test**

Replace:

```ts
  it('mounts the jobs page assistant as a body-level floating panel', () => {
    const main = readSource('../../../main.ts')
    const platform = readSource('../../../platform/platform.ts')
    const style = readSource('../../../style.css')

    expect(platform).toContain('p = "floating"')
    expect(platform).toContain('isJobsPageReady')
    expect(platform).toContain('body.innerText.includes("加载中，请稍候")')
    expect(main).toContain("rootApp.classList.toggle('ai-job-floating', p === \"floating\")")
    expect(style).toContain('.ai-job-floating')
  })
```

with:

```ts
  it('mounts the jobs page assistant under a BOSS container instead of body', () => {
    const main = readSource('../../../main.ts')
    const platform = readSource('../../../platform/platform.ts')
    const style = readSource('../../../style.css')

    expect(platform).toContain('getJobsPageMountContainer')
    expect(platform).toContain('element = this.getJobsPageMountContainer()')
    expect(platform).not.toContain('element = document.body')
    expect(platform).toContain('p = "floating"')
    expect(platform).toContain('isJobsPageReady')
    expect(platform).toContain('body.innerText.includes("加载中，请稍候")')
    expect(main).toContain("rootApp.classList.toggle('ai-job-floating', p === \"floating\")")
    expect(main).toContain('containerEle.appendChild(rootApp)')
    expect(main).not.toContain('currentBody.appendChild(rootApp)')
    expect(style).toContain('.ai-job-floating')
  })
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm test -- src/components/ui/__tests__/PaymentCleanup.test.ts
```

Expected: FAIL. The failure should mention missing `getJobsPageMountContainer`, current `element = document.body`, or current `currentBody.appendChild(rootApp)`.

## Task 2: Implement DOM-Safe Mounting

**Files:**
- Modify: `ai-job-dev/ai-job-hunting-ui/src/platform/platform.ts`
- Modify: `ai-job-dev/ai-job-hunting-ui/src/main.ts`

- [ ] **Step 1: Add the jobs-page mount container helper**

In `BossPlatform`, after `isJobsPageReady()`, add:

```ts
    private getJobsPageMountContainer(): Element | null {
        return document.querySelector(".page-jobs-main") ||
            document.querySelector(".job-list-container") ||
            document.querySelector(".job-recommend-result") ||
            document.querySelector(".job-list-box")
    }
```

- [ ] **Step 2: Return the helper result for jobs pages**

Change the `/web/geek/jobs` branch from:

```ts
                if (this.curUrl.includes("www.zhipin.com/web/geek/jobs")) {
                    if (this.isJobsPageReady()) {
                        element = document.body;
                        p = "floating";
                    }
                } else if (this.curUrl.includes("www.zhipin.com/web/geek/job")) {
```

to:

```ts
                if (this.curUrl.includes("www.zhipin.com/web/geek/jobs")) {
                    if (this.isJobsPageReady()) {
                        element = this.getJobsPageMountContainer();
                        p = "floating";
                    }
                } else if (this.curUrl.includes("www.zhipin.com/web/geek/job")) {
```

- [ ] **Step 3: Attach floating roots to `containerEle`**

In `attachRootApp()`, change:

```ts
            if (p === "floating") {
                currentBody.appendChild(rootApp)
            } else if (p === "before") {
```

to:

```ts
            if (p === "floating") {
                containerEle.appendChild(rootApp)
            } else if (p === "before") {
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm test -- src/components/ui/__tests__/PaymentCleanup.test.ts
```

Expected: PASS.

## Task 3: Build, Sync Artifact, And Commit

**Files:**
- Modify: `ai-job-dev/ai-job-hunting.user.js`

- [ ] **Step 1: Run the full frontend tests**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm test
```

Expected: PASS with all current Vitest files passing.

- [ ] **Step 2: Build the userscript**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm run build
```

Expected: `vue-tsc --noEmit && vite build` succeeds and writes `dist/ai-job-hunting.user.js`.

- [ ] **Step 3: Copy the built userscript artifact**

Run:

```bash
cp ai-job-dev/ai-job-hunting-ui/dist/ai-job-hunting.user.js ai-job-dev/ai-job-hunting.user.js
```

Expected: `ai-job-dev/ai-job-hunting.user.js` matches the build output.

- [ ] **Step 4: Run repository diff check**

Run:

```bash
git diff --check
```

Expected: no output and exit code `0`.

- [ ] **Step 5: Commit the DOM-safe mount change**

Run:

```bash
git add ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PaymentCleanup.test.ts \
  ai-job-dev/ai-job-hunting-ui/src/platform/platform.ts \
  ai-job-dev/ai-job-hunting-ui/src/main.ts \
  ai-job-dev/ai-job-hunting.user.js \
  docs/superpowers/plans/2026-07-04-phase-e-dom-safe-mount.md
git commit -m "fix: mount BOSS jobs assistant below page container"
```

Expected: commit succeeds.

## Task 4: Manual Browser Verification Handoff

**Files:**
- No source files.

- [ ] **Step 1: Re-import the userscript**

Manual step in Chrome/Tampermonkey:

```text
Import ai-job-dev/ai-job-hunting.user.js into Tampermonkey.
```

- [ ] **Step 2: Verify BOSS jobs page stability**

On `https://www.zhipin.com/web/geek/jobs`, observe for at least 60 seconds:

```js
({
  aiJobVisible: !!document.querySelector('#ai-job'),
  aiJobParent: document.querySelector('#ai-job')?.parentElement?.className || '',
  bodyDirectAiJob: Array.from(document.body?.children || []).includes(document.querySelector('#ai-job')),
  zhipinFrameDoc: document.querySelector('iframe[name="zhipinFrame"]')?.contentDocument ? 'present' : 'null-or-absent',
  jobCards: document.querySelectorAll('.job-card-wrapper, .job-list-box li, .job-card-wrap').length
})
```

Expected:

- `aiJobVisible` is `true`.
- `bodyDirectAiJob` is `false`.
- BOSS job cards remain visible.
- The console does not repeatedly log `Cannot read properties of null (reading 'body')`.

