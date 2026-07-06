# BOSS Automation Detection And Verification Strategy

Date: 2026-07-05

## Purpose

This note preserves the Phase E browser-debugging findings so future sessions do not repeat the same destructive browser-control path.

The short rule is:

> Do not use Playwright, Chrome Plugin, CDP attach, DevTools, or Playwright-created tabs to verify the real BOSS jobs page. Use macOS Accessibility-level keyboard/mouse simulation plus local script logs instead.

## Observed Problem

When the real BOSS jobs page is opened or controlled through browser automation, it can become `about:blank` after briefly loading:

```text
https://www.zhipin.com/web/geek/jobs -> about:blank
```

This happened with multiple automation routes:

- Codex Chrome Plugin claiming or navigating a BOSS tab.
- `playwright-cli attach --cdp=chrome` followed by selecting/observing the page.
- `playwright-cli tab-new https://www.zhipin.com/web/geek/jobs`.
- `playwright-cli open --browser=chrome --headed --persistent https://www.zhipin.com/web/geek/jobs`.
- Chrome remote-control style URL opening.

The page did briefly load before blanking. During that window, the current userscript could be observed:

- `#ai-job` existed.
- It was mounted under `.page-jobs-main`, not as a direct `document.body` child.
- BOSS job cards were present.
- The assistant panel text appeared as expected.

Therefore the `about:blank` behavior is not evidence that the Phase E DOM-safe mount is failing. It is a separate BOSS automation/debugging detection issue.

## Runtime Evidence

The browser console for Playwright-created or CDP-controlled BOSS tabs showed BOSS resources loading first:

```text
数星埋点初始化成功
current is rspck版本
```

Then near the blanking point the console showed:

```text
Scripts may close only the windows that were opened by them.
```

That warning means page script attempted a close/navigation path that the browser security model restricts for windows not opened by that script.

`navigator.webdriver` was checked in the controlled tab and returned `false`, so this is not only the classic webdriver flag. The likely trigger is broader automation/debugging instrumentation, especially CDP runtime/debugger side effects.

## Public Reference Evidence

The closest public match found was this GitHub discussion:

- https://github.com/loks666/get_jobs/discussions/250

It reports the same BOSS behavior: when BOSS detects a program-driven browser, the page goes back or appears to close. The maintainer also reports that both program control and CDP remote-port control can be detected and can close the page.

General CDP detection background:

- https://datadome.co/threat-research/how-new-headless-chrome-the-cdp-signal-are-impacting-bot-detection/
- https://scrapfly.io/web-scraping-tools/automation-detector

Browser `window.close()` warning background:

- https://stackoverflow.com/questions/25937212/window-close-doesnt-work-scripts-may-close-only-the-windows-that-were-opene

## What Worked

macOS Accessibility-level keyboard simulation worked better than browser automation:

1. Ensure no Playwright CLI browser sessions remain:

   ```bash
   playwright-cli list
   ```

   Expected:

   ```text
   (no browsers)
   ```

2. Use AppleScript/System Events to focus Chrome and type the URL into the address bar:

   ```bash
   osascript \
     -e 'tell application "Google Chrome" to activate' \
     -e 'delay 0.5' \
     -e 'tell application "System Events" to keystroke "l" using command down' \
     -e 'delay 0.2' \
     -e 'tell application "System Events" to keystroke "https://www.zhipin.com/web/geek/jobs"' \
     -e 'delay 0.1' \
     -e 'tell application "System Events" to key code 36'
   ```

3. Wait beyond the previous blanking window:

   ```bash
   sleep 15
   ```

4. Read only URL/title through AppleScript:

   ```bash
   osascript -e 'tell application "Google Chrome" to {URL of active tab of front window, title of active tab of front window}'
   ```

Observed stable result after 15 seconds and again after about 45 seconds:

```text
https://www.zhipin.com/web/geek/jobs, 「杭州招聘」-2026年杭州人才招聘信息 - BOSS直聘
```

Light keyboard interaction also stayed stable:

```bash
osascript \
  -e 'tell application "Google Chrome" to activate' \
  -e 'delay 0.3' \
  -e 'tell application "System Events" to key code 125' \
  -e 'delay 0.1' \
  -e 'tell application "System Events" to key code 125' \
  -e 'delay 0.1' \
  -e 'tell application "System Events" to key code 125'
```

Five seconds later the tab remained:

```text
https://www.zhipin.com/web/geek/jobs, 「杭州招聘」-2026年杭州人才招聘信息 - BOSS直聘
```

## Important Nuance

During the successful Accessibility test, Chrome still had a remote debugging port listening:

```text
127.0.0.1:9222 (LISTEN)
```

But Playwright had no active attached browser session.

This suggests the strongest observed trigger is not merely that the remote debugging port exists. The destructive trigger appears when a tool actively attaches to or drives the page via CDP/Playwright/Chrome Plugin, which can enable runtime/debugger side effects visible to BOSS.

For the cleanest manual verification, still prefer a Chrome instance launched without remote debugging.

## Do Not Do

For the real BOSS page, do not use:

- `playwright-cli attach --cdp=chrome`
- `playwright-cli tab-new https://www.zhipin.com/...`
- `playwright-cli goto https://www.zhipin.com/...`
- `playwright-cli open ... https://www.zhipin.com/...`
- Codex Chrome Plugin to claim or navigate BOSS pages.
- DevTools/F12 on the BOSS page.
- DOM reads through CDP or Playwright on BOSS pages.

These are allowed for local pages and tests, but not for the live BOSS site.

## Recommended Verification Architecture

Use a split verification model:

1. Local automated tests:
   - Vitest/jsdom for userscript UI and mount policy.
   - Backend unit/integration tests.
   - Mocked BOSS DOM fixtures where possible.

2. Real BOSS page smoke checks:
   - Human opens or Accessibility types the URL.
   - No CDP/Playwright/DevTools attach.
   - Use only keyboard/mouse-level actions.
   - Avoid destructive actions such as `开始投递`, `导入简历`, AI-seat toggles, uploads, sends, or save actions unless the user explicitly authorizes that exact action.

3. Userscript observability:
   - Prefer adding an in-page diagnostic/export panel or writing diagnostics to the local backend.
   - Codex can inspect local backend logs or exported files instead of inspecting the live BOSS DOM through CDP.

## Future Session Checklist

Before touching BOSS in a new session:

1. Read this file.
2. Confirm there are no Playwright sessions:

   ```bash
   playwright-cli list
   ```

3. If any session is attached, detach it:

   ```bash
   playwright-cli -s=<session> detach
   ```

4. Do not use browser automation to open or inspect BOSS.
5. If the page is already stuck at `about:blank`, close the BOSS tab and reopen through human input or Accessibility keyboard input.
6. For anything that needs structured data from the page, first implement a safe userscript diagnostic/logging path, then read the local log/output.

## Current Working Hypothesis

BOSS has anti-automation and anti-debugging logic that detects active browser instrumentation. CDP-based tools can leave detectable side effects even when `navigator.webdriver === false`. When detected, BOSS initiates a close/back/blank navigation path, which appears to the user as the page disappearing or becoming `about:blank`.

This is separate from the earlier DOM cycle issue documented in:

- `docs/phase-e/boss-jobs-dom-cycle-root-cause.md`

The DOM-safe mount fix can still be valid, but it must be verified without CDP/Playwright on the real BOSS page.
