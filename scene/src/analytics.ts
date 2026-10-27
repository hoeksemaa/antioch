// Vercel Web Analytics (page views, no cookies) on the deployed site. Not in
// a browser that a script drives: navigator.webdriver (the Python benchmark's
// captures) or headless Chrome (Playwright checks that hide webdriver), so
// only real visitors count.

import { inject } from "@vercel/analytics";

const driven = navigator.webdriver || /HeadlessChrome/.test(navigator.userAgent);
if (import.meta.env.PROD && !driven) inject({ mode: "production" });
