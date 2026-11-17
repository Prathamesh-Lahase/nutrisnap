# NutriSnap 

Files:
- index.html        the whole app (static page)
- api/analyze.js    serverless function that calls Google Gemini (keeps your key secret)

## Easiest: paste your own key in the app (no server setup)
Open the site -> AI settings card under the scanner -> paste your Gemini key -> Save key -> Test key.
The key is stored only in that browser (localStorage). Never hard-code a key in index.html:
anything in the page is public once deployed.

## Already set up: your key is inside api/analyze.js (server side)
The site works for every visitor after deploying. Keep the GitHub repo PRIVATE. Never paste the key into index.html.

## Optional: shared server key for all visitors (free)
1. Get a free key: https://aistudio.google.com/apikey  (no billing needed)
2. Put these files in a GitHub repo (keep the folder layout: index.html + api/analyze.js)
   OR use the Vercel CLI: `npm i -g vercel` then `vercel` inside this folder.
3. Vercel dashboard -> New Project -> import the repo -> Deploy.
4. Project -> Settings -> Environment Variables -> add
      GEMINI_API_KEY = your key      (Production, Preview, Development)
   Optional: GEMINI_MODEL = a model name from AI Studio, to force one model.
5. Redeploy (Deployments -> ... -> Redeploy) so the variable is picked up.
6. Open your Vercel URL (HTTPS), allow the camera, scan a meal.

## Notes
- Never put the key inside index.html. Only api/analyze.js reads it, from the environment.
- The function limits each visitor to 8 requests per minute to protect your free quota.
- If analysis stops working, check Vercel -> Logs, and that the model names in api/analyze.js
  still exist (Google retires models); set GEMINI_MODEL to a current one.
- Free-tier requests may be used by Google to improve its products (already stated in the Privacy Policy).
- Estimates are approximate and not medical advice.
