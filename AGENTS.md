# AGENTS.md - Next AI Draw.io Development Guide

This guide provides essential context for AI agents working on this codebase.

## Project Overview

Next AI Draw.io is an AI-powered diagram creation tool built with Next.js 16, React 19, and draw.io integration. It supports multiple LLM providers and can be deployed as a web app, desktop application (Electron), or serverless (Cloudflare Workers).

## Build Commands

```bash
# Development
npm run dev                    # Next.js dev server (port 6002)
npm run electron:dev           # Run Electron desktop app

# Building
npm run build                  # Next.js production build
npm run electron:build         # Build Electron app
npm run electron:compile       # Compile Electron TypeScript
npm run dist                   # Build and package Electron distributable
npm run dist:win               # Windows distributable
npm run dist:mac               # macOS distributable
npm run dist:linux             # Linux distributable

# Cloudflare Workers
npm run preview                # Preview Cloudflare deployment
npm run deploy                 # Deploy to Cloudflare Workers
npm run upload                 # Upload to Cloudflare

# Code Quality
npm run lint                   # Biome linting
npm run format                 # Biome format (writes changes)
npm run check                  # Biome CI check
npm run cf-typegen             # Generate Cloudflare types

# Testing
npm run test                   # Vitest unit tests
npm run test:e2e               # Playwright e2e tests
```

**Run a single test**: `npx vitest run <file-path>` or `npx vitest -t "<test-name>"`

**Test location patterns**:
- Unit tests: `tests/**/*.test.{ts,tsx}`
- E2E tests: `tests/e2e/**/*.spec.ts`

## Code Style Guidelines

### Formatter & Linter

- **Formatter**: Biome (biome.json) with 4-space indentation
- **Linter**: Biome + ESLint (extends `next/core-web-vitals`, `next/typescript`)
- **Format**: Double quotes, semicolons as-needed
- **Check code quality**: `npm run check` before committing

### TypeScript

- **Strict mode**: Enabled in tsconfig.json
- **Target**: ES2017
- **Module**: esnext with bundler resolution
- **Path alias**: `@/*` → `./*` (root)
- **No type suppression**: Never use `as any`, `@ts-ignore`, or `@ts-expect-error`

### React & Next.js

- **React**: Version 19.x
- **Next.js**: Version 16.x (App Router)
- **Client components**: Must include `"use client"` directive
- **Server components**: Default for app directory
- **Fetching**: Use Vercel AI SDK (`ai`, `@ai-sdk/react`)

### Imports & Paths

Available path aliases:
- `@/components` → `./components`
- `@/components/ui` → `./components/ui`
- `@/lib` → `./lib`
- `@/lib/utils` → `./lib/utils`
- `@/hooks` → `./hooks`

Import order convention:
1. React/Next.js imports
2. Third-party library imports
3. @/ imports (internal)
4. Relative imports

### UI Components (shadcn/ui)

- **Style**: new-york style
- **CSS**: Tailwind CSS v4 with CSS variables
- **Colors**: Neutral base color, `--primary`, `--secondary`, etc.
- **Icons**: Lucide React
- **Motion**: Framer Motion for animations

### Naming Conventions

- **Components**: PascalCase (`ChatPanel`, `ModelSelector`)
- **Hooks**: camelCase with `use` prefix (`useChat`, `useFileProcessor`)
- **Utilities**: camelCase (`formatDate`, `parseXml`)
- **Constants**: UPPER_SNAKE_CASE for config constants
- **Files**: kebab-case for non-component files (`chat-helpers.ts`)

### Error Handling

- **Server-side errors**: Log with `[ComponentName]` prefix, use `console.warn` for recoverable errors
- **Client errors**: Toast notifications via `sonner` or `error-toast.tsx`
- **API errors**: Return structured responses with error codes
- **Never suppress errors**: No empty catch blocks

### Database & State

- **Local storage**: IndexedDB (via `idb`) for browser persistence
- **Server state**: Vercel AI SDK's `useChat`, `useCompletion`
- **Global state**: React Context (`contexts/` directory)
- **Quotas**: DynamoDB for server-side quota management

### Testing

- **Unit tests**: Vitest + React Testing Library + jsdom
- **E2E tests**: Playwright with chromium
- **Coverage**: Reports in `coverage/` directory
- **CI**: Tests run on GitHub Actions

### Git Workflow

- **Commits**: Conventional commits (feature/fix/docs)
- **Pre-commit**: Husky + lint-staged (Biome)
- **Branching**: Feature branches off main

### Environment Variables

- **Template**: `.env.example` → copy to `.env.local`
- **Required**: API keys for LLM providers
- **Optional**: Langfuse for telemetry, DynamoDB for quotas
- **Secrets**: Never commit `.env.local` or secrets

## Project Structure

```
next-ai-draw-io/
├── app/                    # Next.js App Router
│   ├── [lang]/            # i18n routes
│   ├── api/               # API routes
│   └── globals.css        # Tailwind CSS
├── components/
│   ├── ai-elements/       # AI chat components
│   ├── chat/              # Chat UI components
│   └── ui/                # shadcn/ui components
├── contexts/              # React Context providers
├── docs/                  # Documentation
├── edge-functions/        # Edge runtime functions
├── electron/              # Electron app source
├── hooks/                 # Custom React hooks
├── lib/                   # Utility functions
│   ├── i18n/             # Internationalization
│   ├── types/            # TypeScript types
│   └── utils.ts          # Shared utilities
├── packages/              # MCP server package
├── public/               # Static assets
├── scripts/              # Build scripts
├── tests/
│   ├── e2e/              # Playwright tests
│   └── *.test.ts         # Unit tests
└── resources/            # App resources
```

## Key Technologies

- **Framework**: Next.js 16 (App Router)
- **AI**: Vercel AI SDK 6.x (@ai-sdk/*)
- **Diagrams**: react-drawio, draw.io
- **UI**: React 19, Tailwind CSS v4, shadcn/ui
- **Testing**: Vitest, Playwright
- **Deployment**: Vercel, Cloudflare Workers, Electron