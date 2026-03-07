# Doc Tools MCP Server

[![CI](https://github.com/metaneutrons/doc-tools-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/metaneutrons/doc-tools-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@metaneutrons/doc-tools-mcp)](https://www.npmjs.com/package/@metaneutrons/doc-tools-mcp)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.26-purple)](https://modelcontextprotocol.io/)

> **⚠️ Work in Progress** — APIs may change without notice.

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for managing [pandoc](https://pandoc.org/)/CSL-YAML bibliographies. Lets your LLM read, search, add, update, delete, and validate citation entries directly.

## Quick Start

```bash
npx @metaneutrons/doc-tools-mcp
```

Add to your MCP client config (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "doc-tools": {
      "command": "npx",
      "args": ["-y", "@metaneutrons/doc-tools-mcp"]
    }
  }
}
```

> All `bib:*` tools take a `file` parameter — the path to your CSL-YAML bibliography file.
> The LLM discovers this automatically from `bibliography:` in `pandoc.yaml` or the YAML frontmatter of your `.md` files.

## Tools

### Read

| Tool | Description |
|------|-------------|
| `bib:get` | Retrieve a single entry by ID (full YAML block) |
| `bib:search` | Full-text search across all fields: author, title, type, year, editor, container-title |
| `bib:list` | List all entries of a given type (e.g., `legal_case`, `chapter`, `article-journal`) |
| `bib:exists` | Check if an ID exists (fast boolean check before citing) |
| `bib:stats` | Entry count total and breakdown by CSL type |

### Write

| Tool | Description |
|------|-------------|
| `bib:add` | Add a new entry with duplicate ID check, required field validation per CSL type, and YAML confirmation output |
| `bib:update` | Patch individual fields of an existing entry (other fields remain untouched) |
| `bib:delete` | Remove an entry by ID |

### Validation

| Tool | Description |
|------|-------------|
| `bib:validate` | Check entire file: YAML syntax, required fields per CSL type, duplicate IDs, missing `issued` dates |

All write operations automatically create a `.bak` backup before modifying the file.

## Supported CSL Types

Required field validation is provided for these types:

| Type | Required Fields |
|------|----------------|
| `legal_case` | `title`, `authority`, `number`, `issued` |
| `book` | `title`, `issued` |
| `article-journal` | `title`, `container-title`, `issued` |
| `chapter` | `title`, `container-title`, `issued` |
| `legislation` | `title`, `issued` |
| `thesis` | `title`, `issued` |

Other types are accepted without required field validation.

## Architecture

```
src/
├── index.ts                    # MCP server with dynamic provider loading
├── shared/
│   ├── types.ts                # Provider interface, ToolDefinition, ToolResult
│   ├── logger.ts               # Structured logging (pino → stderr)
│   └── errors.ts               # Typed error hierarchy
└── providers/
    └── bib/                    # Bibliography provider
        ├── index.ts            # Provider implementation (9 tool handlers)
        ├── store.ts            # YAML read/write with .bak backup
        ├── schema.ts           # Zod schemas + per-type field validation
        └── tools/              # Tool definitions (read + write)
```

The provider system is extensible — add a new directory under `src/providers/` with a `createProvider()` export and it will be auto-discovered at startup.

## Development

```bash
npm install           # Install dependencies
npm run build         # Compile TypeScript
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run lint          # ESLint
```

### Commit Convention

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) enforced via Husky + commitlint.

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`
**Scopes:** `bib`, `core`, `deps`, `config`

## License

GPL-3.0 — See [LICENSE](LICENSE) for details.
