---
name: clerk
description: Clerk authentication router. Use when user asks about adding authentication,
  setting up Clerk, custom sign-in flows, Swift or native iOS auth, native Android
  auth, Next.js patterns, React patterns, Vue patterns, Nuxt patterns, Astro patterns,
  TanStack Start patterns, Expo patterns, React Router patterns, Chrome Extension patterns,
  organizations, syncing users, or testing. Automatically routes to the specific skill
  based on their task.
license: MIT
metadata:
  version: 2.0.0
---

# Clerk Skills Router

## Version Detection

Check `package.json` to determine the Clerk SDK version. This determines which patterns to use:

| Package | Core 2 (LTS until Jan 2027) | Current |
|---------|----------------------------|---------|
| `@clerk/nextjs` | v5–v6 | v7+ |
| `@clerk/react` or `@clerk/clerk-react` | v5–v6 | v7+ |
| `@clerk/expo` or `@clerk/clerk-expo` | v1–v2 | v3+ |
| `@clerk/react-router` | v1–v2 | v3+ |
| `@clerk/tanstack-react-start` | < v0.26.0 | v0.26.0+ |

**Default to current** if the version is unclear or the project is new. Core 2 packages use `@clerk/clerk-react` and `@clerk/clerk-expo` (with `clerk-` prefix); current packages use `@clerk/react` and `@clerk/expo`.

All skills are written for the current SDK. When something differs in Core 2, it's noted inline with `> **Core 2 ONLY (skip if current SDK):**` callouts. The exception is `clerk-custom-ui`, which has separate `core-2/` and `core-3/` directories for custom flow hooks since those APIs are entirely different between versions.

> **Note**: This installation only includes the framework skills actually used in this environment (React, React Router, TanStack Start, plus setup/orgs/webhooks/testing/backend-api/custom-ui). The upstream Clerk skill pack also ships `clerk-nextjs-patterns`, `clerk-vue-patterns`, `clerk-nuxt-patterns`, `clerk-astro-patterns`, `clerk-expo-patterns`, `clerk-chrome-extension-patterns`, `clerk-swift`, and `clerk-android` — install them from the same source if a project needs one of those frameworks.

---

## By Task

**Adding Clerk to your project** → Use `clerk-setup`
- Framework detection and quickstart
- Environment setup, API keys, Keyless flow
- Migration from other auth providers

**Custom sign-in/sign-up UI** → Use `clerk-custom-ui`
- Custom authentication flows with `useSignIn` / `useSignUp` hooks
- Appearance and styling (themes, colors, layout)
- `<Show>` component for conditional rendering

**React patterns** → Use `clerk-react-patterns`
- Hooks (`useAuth`, `useUser`, `useClerk`)
- Protected routes, auth guards
- Router integration

**React Router patterns** → Use `clerk-react-router-patterns`
- Loaders & actions with auth
- Route protection
- SSR auth

**TanStack Start patterns** → Use `clerk-tanstack-patterns`
- Server functions with auth
- Route protection via loaders
- Vinxi server integration

**B2B / Organizations** → Use `clerk-orgs`
- Multi-tenant apps
- Organization slugs in URLs
- Roles, permissions, RBAC
- Member management

**Webhooks** → Use `clerk-webhooks`
- Real-time events
- Data syncing
- Notifications & integrations

**E2E Testing** → Use `clerk-testing`
- Playwright/Cypress setup
- Auth flow testing
- Test utilities

**Backend REST API** → Use `clerk-backend-api`
- Browse API tags and endpoints
- Inspect endpoint schemas
- Execute API requests with scope enforcement

## Quick Navigation

If you know your task, you can directly access:
- `/clerk-setup` - Framework setup
- `/clerk-custom-ui` - Custom flows & appearance
- `/clerk-react-patterns` - React patterns
- `/clerk-react-router-patterns` - React Router patterns
- `/clerk-tanstack-patterns` - TanStack Start patterns
- `/clerk-orgs` - Organizations
- `/clerk-webhooks` - Webhooks
- `/clerk-testing` - Testing
- `/clerk-backend-api` - Backend REST API

Or describe what you need and I'll recommend the right one.
