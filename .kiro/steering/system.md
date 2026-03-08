# Doc Tools MCP Server — System Steering

## Project Identity

MCP server (`@metaneutrons/doc-tools-mcp`) for managing pandoc/CSL-YAML bibliographies and verifying citations. Exposes read, write, validation, and citation verification tools over the Model Context Protocol.

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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DT_BIB_YAML` | Default path to CSL-YAML bibliography file. Makes `file` param optional on all `bib:*` tools. Ignored if file does not exist. |
| `DT_BIB_CSL` | Default path to CSL style file (.csl). Enables style-aware field validation on `bib:validate`, `bib:add`, `bib:update`. Ignored if file does not exist. |

Tool descriptions adapt dynamically: when an env var is set and the file exists, the corresponding parameter shows the default path and becomes optional. Otherwise `file` is required.

## Architecture

```
src/
├── index.ts                    # MCP server, dynamic provider loading, stdio transport
├── shared/
│   ├── types.ts                # Provider, ToolDefinition, ToolResult interfaces
│   ├── logger.ts               # pino-based Logger class (always logs to stderr)
│   └── errors.ts               # BaseError → ValidationError, FileError, NotFoundError, DuplicateError
└── providers/
    ├── bib/                    # Bibliography provider (prefix: "bib:")
    │   ├── index.ts            # BibProvider — 9 tool handlers, env var resolution
    │   ├── store.ts            # BibStore — YAML read/write with .bak backup
    │   ├── schema.ts           # Zod schemas, per-type required field validation (style-aware)
    │   ├── csl-style.ts        # CSL style parser — extracts variables per type from .csl XML
    │   └── tools/              # Tool definitions (read.ts + write.ts), dynamic descriptions
    └── ctverify/               # Citation verification provider (prefix: "ctverify:")
        ├── index.ts            # CtverifyProvider — extract, update, status handlers
        ├── extract.ts          # Pandoc inline footnote parser (^[...])
        └── types.ts            # CitationEntry interface
```

### Provider System

Providers are auto-discovered at startup: any directory under `src/providers/` that exports `createProvider()` is loaded. Each provider owns a namespace prefix (e.g. `bib:`, `ctverify:`) and handles its own tool routing.

### CSL Style Validation

When a CSL style file is available (via `DT_BIB_CSL` or `style` param):
- Variables referenced in the style are extracted per CSL type from `<if type="...">` blocks
- These replace the hardcoded `REQUIRED_FIELDS` for validation
- Entry types not handled by the style produce a warning
- Without a style, the hardcoded fallback is used

### Citation Verification (ctverify)

Workflow: extract citations from Pandoc footnotes → set claims → verify against sources → update status.

Registry is a JSON file. Merge logic matches by `file` + `cite` text (not line numbers) so verification data survives when lines shift. Entries from different files coexist in one registry.

### Error Handling

All domain errors extend `BaseError` with `code`, `userMessage`, and optional `recoveryHint`. Tool handlers catch errors and return `{ isError: true }` results with user-friendly messages.

## Conventions

- **Commits**: Conventional Commits — types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`. Scopes: `bib`, `ctverify`, `core`, `deps`, `config`.
- **Code style**: Strict TypeScript, no `any` (warn), unused vars with `_` prefix allowed. Single quotes, 2-space indent.
- **Tool naming**: `<provider>:<action>` (e.g. `bib:get`, `ctverify:extract`).
- **Tool descriptions**: Dynamic — adapt based on env vars and file existence at runtime.
- **Logging**: Never log to stdout (reserved for MCP stdio transport). Use `rootLogger.child()` per module. Log resolved file sources (args vs env) at debug level, warn on missing env var files.
- **Tests**: Co-located `*.test.ts` files, excluded from build via tsconfig.

## Adding a New Provider

1. Create `src/providers/<name>/index.ts` exporting `createProvider(): Provider | null`.
2. Implement the `Provider` interface from `shared/types.ts`.
3. Prefix all tool names with `<name>:`.
4. The server discovers and registers it automatically at startup.
