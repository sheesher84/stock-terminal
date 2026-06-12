# Stock Research Terminal

AI-powered institutional stock analysis. Up to 5 tickers at once. Options signals, insider activity, bull/bear thesis, scorecard radar.

---

## Deploy to Vercel in 5 minutes

### Step 1 — Get your OpenAI API key
1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key" — name it "stock-terminal"
3. Copy it immediately (shown once)
4. Confirm you have credits at https://platform.openai.com/usage

### Step 2 — Put this code on GitHub
1. Go to https://github.com/new
2. Create a new repository called "stock-terminal" (private is fine)
3. Upload all these files — drag and drop the whole folder works
4. Click "Commit changes"

### Step 3 — Deploy on Vercel
1. Go to https://vercel.com and log in
2. Click "Add New Project"
3. Import your "stock-terminal" GitHub repo
4. Click Deploy — Vercel auto-detects Vite/React
5. Done — you get a live URL like https://stock-terminal-xyz.vercel.app

### Step 4 — Use it
1. Open your Vercel URL
2. Click "Set API Key" and paste your OpenAI key (sk-...)
3. Key is saved in YOUR browser only — never sent anywhere except OpenAI
4. Add tickers, hit Run Analysis

---

## Cost
- Model: gpt-4o-mini
- ~$0.001 per full analysis (1 ticker)
- ~$0.004 per 5-ticker comparison
- $5 in credits = ~5,000 analyses

## To share with friends
Just send them your Vercel URL. They enter their OWN OpenAI API key — 
or you can hardcode yours in a backend proxy if you want to cover costs for them.

## Tech stack
- React 18 + Vite
- Recharts (radar charts)
- OpenAI gpt-4o-mini API
- Zero backend — runs entirely in the browser
- Deployable anywhere static files are served (Vercel, Netlify, GitHub Pages)

---

## Commercialization path
When you're ready to charge users:
1. Add Clerk (https://clerk.com) for auth — free tier handles 10k users
2. Add Stripe for payments — $15-29/mo subscription
3. Move the API key to a backend (Vercel Edge Functions) so users don't need their own
4. Add a usage counter per user in a free Supabase database

Not financial advice disclaimer is already in the app footer.
