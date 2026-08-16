# Rango Social

Rango Social is a mobile-first Brazilian restaurant discovery and social-review
app. Users discover restaurants, publish structured reviews, follow friends,
join groups, curate lists, share stories and vibe checks, compare restaurants in
duels, and ask a taste-profile-aware AI for recommendations.

## Local development

```bash
npm install
npm run dev
```

The app can run in mock mode without Supabase. For the real backend, configure
the variables described in [SUPABASE_SETUP.md](SUPABASE_SETUP.md) and set
`VITE_DATA_SOURCE=supabase`.

## Useful commands

```bash
npm run dev       # local Vite app
npm run test:run  # Vitest once
npm run lint      # ESLint
npm run build     # TypeScript and production Vite build
npm run seed      # optional demo fixture seed, when configured
```

For production PWA, Vercel functions, cron jobs, and Capacitor builds, see
[DEPLOY.md](DEPLOY.md). [QA_DOD.md](QA_DOD.md) contains the existing acceptance
checklist.
