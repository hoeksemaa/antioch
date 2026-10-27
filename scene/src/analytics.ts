// Vercel Web Analytics (page views, no cookies) on the deployed site. Not in
// a browser that a script drives (navigator.webdriver: the Python benchmark's
// captures and Playwright checks), so only real visitors count.

import { inject } from "@vercel/analytics";

if (import.meta.env.PROD && !navigator.webdriver) inject({ mode: "production" });
