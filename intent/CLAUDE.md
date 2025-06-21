# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an ultra-minimal SQL intent library that provides a Knex.js-compatible query builder with intent recording in just ~45 lines of code. The library allows building SQL queries while recording each step, with the ability to inspect, manipulate, remove steps, and group related steps before final execution.

## Core Architecture

The entire implementation is based on a JavaScript Proxy pattern in `src/index.ts`:

- **Proxy-based API**: Uses `new Proxy({}, {...})` to automatically intercept ALL method calls, eliminating the need to manually implement each Knex method
- **Step Recording**: Each method call creates a `Step` object `{ type: string; args: any[]; name?: string; steps?: Step[] }` stored in an immutable array
- **Grouping**: `startGroup()` and `endGroup()` allow bundling multiple steps into a single manipulatable unit
- **Knex Integration**: The `toKnex()` method replays recorded steps (including grouped steps) on a real Knex QueryBuilder instance
- **Immutable Operations**: Every operation returns a new instance with a new steps array

Key insight: This achieves 1:1 Knex API compatibility without implementing any Knex methods directly - the Proxy automatically forwards all method calls to step recording.

## Development Commands

```bash
# Build for production (uses tsconfig.build.json)
npm run build

# Development build with watch
npm run dev

# Run all tests
npm test

# Run tests in watch mode
npm test:watch

# Run a single test file
npx jest __tests__/index.test.ts

# Lint code
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

## TypeScript Configuration

The project uses a dual TypeScript setup:
- `tsconfig.json`: Main config for editor support (includes both src and tests)
- `tsconfig.build.json`: Production build config (only src files, with proper rootDir)

This ensures your editor recognizes Jest globals in test files while keeping clean production builds.

## Testing Strategy

Tests use Jest with mocked Knex QueryBuilder objects to avoid database dependencies. The test suite focuses on:
- Step recording and manipulation
- Proxy method interception
- Immutability verification
- Knex integration points

## API Design Principles

- **Zero Configuration**: Works with any Knex instance without setup
- **Future-Proof**: New Knex methods automatically work without code changes  
- **Minimal Surface Area**: Only 8 special methods (`getSteps`, `toKnex`, `toSQL`, `execute`, `remove`, `name`, `startGroup`, `endGroup`) - everything else gets proxied
- **Type Safety**: Full TypeScript support with Knex type inference

## Development Notes

- The `any` types in the implementation are intentional and necessary for the Proxy pattern
- Knex is a peerDependency to avoid version conflicts with user projects
- The library maintains full Knex API compatibility by design - any breaking changes should be thoroughly tested against real Knex usage

# Standard Workflow

1. First think through the problem, read the codebase for relevant files, and write a plan to projectplan.md
2. The plan should have a list of todo items that you can check off as you complete them
3. Before you begin working, check in with me and I will verify the plan
4. Then, begin working on the todo items, marking them as complete as you go
5. Please every step of the way just give me a high level explanation of what changes you made
6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity
7. Finally, add a review section to the projectplan.md file with a summary of the changes you made and any other relevant information
