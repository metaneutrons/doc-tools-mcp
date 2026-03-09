# Doc Tools MCP Server

[![CI](https://github.com/metaneutrons/doc-tools-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/metaneutrons/doc-tools-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@metaneutrons/doc-tools-mcp)](https://www.npmjs.com/package/@metaneutrons/doc-tools-mcp)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.26-purple)](https://modelcontextprotocol.io/)

> **⚠️ Work in Progress** — APIs may change without notice.

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for managing [pandoc](https://pandoc.org/)/CSL-YAML bibliographies and verifying citations. Lets your LLM read, search, add, update, delete, validate bibliography entries, and systematically verify that citations support the claims made in your text.

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
      "args": ["-y", "@metaneutrons/doc-tools-mcp"],
      "env": {
        "DT_BIB_YAML": "/path/to/references.yaml",
        "DT_BIB_CSL": "/path/to/style.csl",
        "DT_CT_REGISTRY": "/path/to/ctverify.json"
      }
    }
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DT_BIB_YAML` | Default path to CSL-YAML bibliography file. Makes `file` param optional on all `bib:*` tools. |
| `DT_BIB_CSL` | Default path to CSL style file (.csl). Enables style-aware field validation on `bib:validate`, `bib:add`, `bib:update`. |
| `DT_CT_REGISTRY` | Default path to citation verification registry JSON. Makes `registry_path` optional on all `ctverify:*` tools. |

All env vars are ignored if the referenced file does not exist. Tool descriptions adapt dynamically to show configured defaults.

## Bibliography Tools (`bib:*`)

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
| `bib:add` | Add a new entry with duplicate ID check, required field validation, and YAML confirmation output |
| `bib:update` | Patch individual fields of an existing entry (other fields remain untouched) |
| `bib:delete` | Remove an entry by ID |

### Validation

| Tool | Description |
|------|-------------|
| `bib:validate` | Check entire file: YAML syntax, required fields per CSL type, duplicate IDs, missing `issued` dates |

All write operations automatically create a `.bak` backup before modifying the file.

### CSL Style Validation

When a CSL style file is configured (via `DT_BIB_CSL` or the `style` parameter), validation uses the variables actually referenced in the style instead of hardcoded required fields. Entry types not handled by the style produce a warning.

Without a style file, these hardcoded defaults apply:

| Type | Required Fields |
|------|----------------|
| `legal_case` | `title`, `authority`, `number`, `issued` |
| `book` | `title`, `issued` |
| `article-journal` | `title`, `container-title`, `issued` |
| `chapter` | `title`, `container-title`, `issued` |
| `legislation` | `title`, `issued` |
| `thesis` | `title`, `issued` |

## Citation Verification Tools (`ctverify:*`)

Systematic verification that cited sources actually support the claims made in the text.

**Workflow:** extract → set claims → verify each claim against the source → update status.

| Tool | Description |
|------|-------------|
| `ctverify:extract` | Extract citations from Pandoc inline footnotes (`^[...]`). Accepts single file or array of files. Merges into registry preserving existing claims and statuses. |
| `ctverify:update` | Update or add a single citation entry: set `claim`, `status`, `note`. Creates new entries when `cite` is provided. |
| `ctverify:bulk-update` | Batch status update by ID list or `filter_status`. |
| `ctverify:status` | Show verification progress with counts. Filter by `filter_status` or `filter_claim` (use `""` for missing claims). |

The registry matches entries by file + citation text, so verification data survives when line numbers shift after edits.

## Architecture

```
src/
├── index.ts                    # MCP server, dynamic provider loading, stdio transport
├── shared/
│   ├── types.ts                # Provider, ToolDefinition, ToolResult interfaces
│   ├── logger.ts               # Structured logging (pino → stderr)
│   └── errors.ts               # Typed error hierarchy
└── providers/
    ├── bib/                    # Bibliography provider
    │   ├── index.ts            # BibProvider (9 tool handlers, env var resolution)
    │   ├── store.ts            # YAML read/write with .bak backup
    │   ├── schema.ts           # Zod schemas + per-type field validation
    │   ├── csl-style.ts        # CSL style parser (variable extraction per type)
    │   └── tools/              # Dynamic tool definitions (read + write)
    └── ctverify/               # Citation verification provider
        ├── index.ts            # CtverifyProvider (4 tool handlers)
        ├── extract.ts          # Pandoc inline footnote parser
        └── types.ts            # CitationEntry interface
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
**Scopes:** `bib`, `ctverify`, `core`, `deps`, `config`

## License

GPL-3.0 — See [LICENSE](LICENSE) for details.
