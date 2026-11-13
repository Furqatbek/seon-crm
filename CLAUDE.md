# Edu CRM

Staff-only CRM for one education centre in Uzbekistan. Owner and Manager log in.
Teachers, students and parents never log in. Full spec: docs/SPEC.md — read the
section each task names before writing code.

## Stack
- Next.js, App Router, TypeScript strict, Server Components + Server Actions
- Supabase: Postgres, Auth (email + password), Row Level Security, Supabase Cron
- Tailwind CSS v4 + shadcn/ui restyled to our tokens, lucide-react icons
- next-intl for uz / ru / en; zod + react-hook-form for every form
- TanStack Table for lists, Recharts for report charts
- Vitest for logic tests, Playwright for end-to-end tests; hosted on Vercel

## Commands
- npm run dev | build | lint | typecheck | test | e2e
- npx supabase migration new <name>  → new migration file
- npx supabase db push               → apply migrations to the linked dev project
- npm run db:types                   → regenerate src/lib/supabase/types.ts

## Rules
- IMPORTANT: build only what the spec lists. No extra pages, fields or settings.
- Money = UZS as bigint whole soʻm. Never floats. Display only via formatMoney().
- Time zone Asia/Tashkent. Store timestamptz; a billing month is a date (1st of month).
- Every visible string goes through next-intl. Add each key to messages/uz.json,
  ru.json and en.json in the same change. Uzbek is Latin script with ʻ (U+02BB).
- RLS on every table. Permissions are enforced in the database, not only the UI.
- Balances, proration and salaries are computed in Postgres functions or
  src/lib/domain/ with unit tests. Components never calculate money.
- Never hard-delete business records: set archived_at. Only the owner archives.
- Colours, radii, shadows only from src/styles/tokens.css. No hard-coded values.
- Schema changes only as new files in supabase/migrations/. Never edit an applied one.
- Secrets only in environment variables. Never commit .env files.

## Structure
- src/app/[locale]/(app)/{leads,students,groups,teachers,finance,reports,settings}
- src/components/ui = shared primitives; src/components/<block> = block parts
- src/lib/domain = pure business logic + tests; src/lib/supabase = clients + types
- supabase/migrations, supabase/seed.sql

## Done means
Typecheck, lint and tests pass. The feature works in uz, ru and en. Screenshots at
1440 px and 390 px wide follow the design rules in docs/SPEC.md.
