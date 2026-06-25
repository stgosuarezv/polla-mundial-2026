# Contributing

Thanks for your interest in contributing! All changes are reviewed before merging.

## Stack overview

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4** · **shadcn/ui** components
- **Supabase** (Postgres + RLS + pg_cron) for backend and auth
- **Resend** for transactional email
- **Vitest** for unit tests · **pnpm** as package manager

## Getting started

**Invited collaborators** — clone directly:

```bash
git clone https://github.com/stgosuarezv/polla-mundial-2026.git
cd polla-mundial-2026
```

**External contributors** — fork first (the **Fork** button on GitHub), then clone your fork.

### Local setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the env template and fill in your values:

   ```bash
   cp .env.example .env.local
   ```

   You'll need a Supabase project, a football-data.org API key, and a Resend API key. See the comments in `.env.example` for where to get each one.

3. Start the dev server:

   ```bash
   pnpm dev
   ```

   The app runs at `http://localhost:3000`.

## Making a change

1. Create a branch with a `feat/`, `fix/`, or `chore/` prefix:

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. Make your changes and commit with a clear message:

   ```bash
   git add <files>
   git commit -m "feat: describe what you changed"
   ```

3. Before pushing, verify your change passes lint, tests, and build:

   ```bash
   pnpm lint
   pnpm test
   pnpm build
   ```

4. Push and open a PR against `main`:

   ```bash
   git push -u origin feat/your-feature-name
   ```

   Then open a **Pull Request** on GitHub.

> **Trivial hotfixes** (a single one-line change like a copy tweak or color fix) may land directly on `main` without a PR.

## Database migrations

If your change requires a schema update, add a new file under `supabase/migrations/` following the existing naming pattern (`YYYYMMDDNNNNNN_description.sql`).

**Security rule:** any new user-scoped table must follow the RLS view pattern used throughout the project — create a `my_<entity>` view with `security_invoker = true` and `WHERE user_id = auth.uid()`. Never query the base `predictions` or `podio_predictions` tables for the current user's own data; use the `my_*` views instead. See `CLAUDE.md` for the full rationale.

## After you open a PR

- A **Vercel preview deployment** is built automatically — check the preview link to confirm your change works before requesting review.
- A maintainer will review and may leave comments. Resolve all comments before the PR can be merged.
- Pushing new commits after a review dismisses the previous approval and triggers a re-review.
- Only maintainers can merge to `main`.

## Guidelines

- Keep PRs focused — one feature or fix per PR makes review faster.
- Write a clear PR description explaining what changed and why.
- Make sure `pnpm lint`, `pnpm test`, and the Vercel preview build all pass before requesting review.

## Questions

Open an issue or reach out to a maintainer. Thanks for contributing!
