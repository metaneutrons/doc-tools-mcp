# Doc Tools MCP Server — System Steering

## Project Identity

MCP server (`@metaneutrons/doc-tools-mcp`) for managing pandoc/CSL-YAML bibliographies. Exposes read, write, and validation tools over the Model Context Protocol so LLMs can manipulate citation data directly.

License: GPL-3.0. Published to GitHub npm registry.

## Tech Stack

- TypeScript 5.7, ES2022, ESM (`"type": "module"`)
- Node.js ≥ 22
- MCP SDK `@modelcontextprotocol/sdk` ^1.26
- Zod ^4 for schema validation and tool input schemas
- js-yaml for CSL-YAML parsing/serialization
- pino (→ stderr) for structured logging
- Vitest for testing, ESLint for linting
- Husky + commitlint for Conventional Commits

## Architecture

```
src/
├── index.ts              # MCP server, dynamic provider loading, stdio transport
├── shared/
│   ├── types.ts          # Provider, ToolDefinition, ToolResult interfaces
│   ├── logger.ts         # pino-based Logger class (always logs to stderr)
│   └── errors.ts         # BaseError → ValidationError, FileError, NotFoundError, DuplicateError
└── providers/
    └── bib/              # Bibliography provider (prefix: "bib:")
        ├── index.ts      # BibProvider class, 9 tool handlers, createProvider() export
        ├── store.ts      # BibStore — YAML read/write with .bak backup
        ├── schema.ts     # Zod schemas, per-type required field validation
        └── tools/        # Tool definitions split into read.ts and write.ts
```

### Provider System

Providers are auto-discovered at startup: any directory under `src/providers/` that exports `createProvider()` is loaded. Each provider owns a namespace prefix (e.g. `bib:`) and handles its own tool routing.

### Error Handling

All domain errors extend `BaseError` with `code`, `userMessage`, and optional `recoveryHint`. Tool handlers catch errors and return `{ isError: true }` results with user-friendly messages.

### Data Format

Bibliography files are CSL-YAML (`references:` array). All write operations create a `.bak` backup before modifying the file. Entries are validated against Zod schemas; known CSL types have required field checks.

## Conventions

- **Commits**: Conventional Commits — types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`. Scopes: `bib`, `core`, `deps`, `config`.
- **Code style**: Strict TypeScript, no `any` (warn), unused vars with `_` prefix allowed. Single quotes, 2-space indent.
- **Tool naming**: `<provider>:<action>` (e.g. `bib:get`, `bib:search`).
- **Logging**: Never log to stdout (reserved for MCP stdio transport). Use `rootLogger.child()` per module.
- **Tests**: Co-located `*.test.ts` files, excluded from build via tsconfig.

## Adding a New Provider

1. Create `src/providers/<name>/index.ts` exporting `createProvider(): Provider | null`.
2. Implement the `Provider` interface from `shared/types.ts`.
3. Prefix all tool names with `<name>:`.
4. The server discovers and registers it automatically at startup.
