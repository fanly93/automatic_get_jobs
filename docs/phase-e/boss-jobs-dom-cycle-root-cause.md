# BOSS Jobs DOM Cycle Root Cause

Date: 2026-06-30

## Scope

This note records the current root-cause investigation for the BOSS jobs page periodically clearing and restoring the DOM while the Phase E Tampermonkey script is installed.

## Observed Runtime Pattern

Earlier Chrome sampling of the logged-in BOSS jobs tab showed a repeating cycle:

- Normal content: `#ai-job` visible, about 15 job cards, body text populated.
- Loading state: body text becomes `加载中，请稍候`, `#ai-job` absent.
- Blank state: `document.body.children.length` becomes `0` or body text becomes empty.
- Recovery: BOSS content returns; `#ai-job` remounts; cards return after a short delay.

The updated Phase E script was active during the test:

- Old jobs-page `WS Hook Start` / `ChatWebsocket` logs did not appear.
- Old first-screen auto-import and server-connection reload logs did not appear.
- Connection test did not trigger page reload.

The recurring browser console error was:

```text
Cannot read properties of null (reading 'body')
https://static.zhipin.com/zhipin-geek-spa/web/v6681/static/js/app~2.2929c4cc.js
```

## BOSS Script Evidence

The BOSS static bundle was downloaded from:

```text
https://static.zhipin.com/zhipin-geek-spa/web/v6681/static/js/app~2.2929c4cc.js
```

The crash is in webpack module `49657`, BOSS's safe-gateway axios wrapper.

That module creates a hidden iframe once and keeps it in a closure:

```js
var e, t = {}, n = document.createElement("iframe");
n.name = "zhipinFrame";
n.src = "about:blank";
(document.body || document.documentElement).appendChild(n);
```

It then injects BOSS security scripts into that iframe:

```js
h = "/web/common/security-js/" + a + ".js";
b = n || document.getElementsByTagName("head").item(0) || document.documentElement;
"IFRAME" != b.tagName
  ? b.appendChild(w[t])
  : b.contentDocument.body
    ? b.contentDocument.body.appendChild(w[t])
    : b.contentDocument.documentElement.appendChild(w[t])
```

The code does not guard `b.contentDocument` before reading `.body`. Therefore the exact browser error means:

- `b` is the hidden `iframe[name=zhipinFrame]`.
- `b.contentDocument` is `null`.
- BOSS's module still holds the old iframe reference and tries to reuse it.

The same module installs an axios response interceptor. On most successful BOSS API responses it calls the safe-gateway function again:

```js
(-1 === g.indexOf(+e) || u.$M.includes(n?.url)) && m()
```

The excluded code list is:

```js
[31, 32, 35, 36, 37, 5002, 5003, 5004]
```

So after a DOM rebuild detaches or invalidates the hidden iframe, almost any later successful BOSS API response can re-enter this unsafe iframe path and throw.

## Current Project Evidence

The current userscript does not directly clear or reload the host page:

- No `document.body.innerHTML = ...`.
- No `document.body.replaceChildren(...)`.
- No `document.documentElement.innerHTML = ...`.
- No active `window.location.reload()` in runtime source.

The relevant current DOM writes are in `ai-job-dev/ai-job-hunting-ui/src/main.ts`:

```ts
if (p === "floating") {
    currentBody.appendChild(rootApp)
}
```

And the BOSS jobs-page mount policy in `ai-job-dev/ai-job-hunting-ui/src/platform/platform.ts` is:

```ts
if (this.curUrl.includes("www.zhipin.com/web/geek/jobs")) {
    if (this.isJobsPageReady()) {
        element = document.body;
        p = "floating";
    }
}
```

The recovery observer/timer then repeatedly reattaches `#ai-job` whenever BOSS removes it:

```ts
if (appMounted && currentBody && !currentBody.contains(rootApp)) {
    attachRootApp()
}
```

## Root Cause

The direct crash is in BOSS's own safe-gateway code, caused by a stale or detached hidden iframe:

```text
iframe[name=zhipinFrame].contentDocument === null
```

The periodic DOM clear/restore is BOSS's SPA rebuilding the jobs page around that safe-gateway lifecycle. The current script is not directly clearing the DOM, but it mounts `#ai-job` as a direct `body` child on `/web/geek/jobs` and then aggressively reattaches it after BOSS removes it. That puts the assistant in the same top-level DOM lifecycle zone as BOSS's hidden `zhipinFrame`.

The most likely causal chain is:

1. BOSS app creates `iframe[name=zhipinFrame]` as a direct body-level node and stores it in module closure state.
2. Current script creates `div#ai-job` as another direct body-level node and keeps reattaching it with a `MutationObserver` plus 1-second timer.
3. BOSS jobs-page route/safe validation periodically clears or rebuilds body-level children.
4. BOSS's closure still references the old `zhipinFrame`.
5. A later BOSS API success response calls the safe-gateway function.
6. BOSS tries to execute `b.contentDocument.body` on a detached/invalid iframe.
7. The uncaught TypeError disrupts BOSS's jobs-page render flow; the page falls through loading/blank/recovery states.
8. Our recovery logic remounts `#ai-job`, keeping the assistant involved in the same fragile lifecycle area.

## What This Rules Out

The current evidence rules out these as the primary remaining root cause:

- Jobs-page WebSocket hook pollution: the hook is now chat-only and was absent from jobs-page logs.
- First-screen auto-import/reload: those old logs were absent and runtime source no longer calls reload after connection test.
- Direct DOM clearing by our script: source search found no body-clearing or document-clearing operations.

## Reference Project Reassessment

`docs/phase-e/reference-ai-job-findings.md` previously recommended keeping the jobs-page `body + floating` mount. That recommendation should now be revised.

After locating the BOSS `zhipinFrame` failure, body-level mounting is no longer the safest option. The reference project does not solve this issue either; it mounted into BOSS-managed page containers and did not have a robust answer for current BOSS SPA rebuilds.

## Recommended Fix Direction

Do not patch BOSS's minified safe-gateway code from the userscript unless every less invasive option fails.

The safer next implementation target is:

1. Stop mounting `#ai-job` as a direct `document.body` child on `/web/geek/jobs`.
2. Mount under a BOSS page container that is below the app shell but outside the hidden safe iframe's body-level sibling set.
3. Keep the visual layout as a fixed/floating panel through CSS.
4. Make recovery reattach to the selected host container instead of immediately appending back to body.
5. Add browser diagnostics that sample `iframe[name=zhipinFrame]`, `#ai-job`, `body.children.length`, and BOSS console errors for at least 60 seconds after reload.

The key verification criterion after the fix:

- `#ai-job` remains usable.
- BOSS job cards remain visible.
- `iframe[name=zhipinFrame].contentDocument` does not enter repeated `null` states during normal jobs-page browsing.
- No repeated `Cannot read properties of null (reading 'body')` appears from `app~2.2929c4cc.js`.

