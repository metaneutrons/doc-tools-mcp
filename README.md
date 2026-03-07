# Doc Tools MCP Server

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.26-purple)](https://modelcontextprotocol.io/)

> **⚠️ WARNING: Work in Progress**  
> This project is currently under active development and **not production-ready**. APIs may change without notice, and features may be incomplete or unstable. Use at your own risk.

A Model Context Protocol (MCP) server for managing pandoc/CSL-YAML bibliographies. Read, search, add, update, delete, and validate citation entries in CSL-YAML reference files.

## Features

### Bibliography Management (`bib:*` tools)

**Read**
- `bib:get` — Retrieve a single entry by ID (full YAML block)
- `bib:search` — Full-text search across all fields: author, title, type, year, editor, container-title
- `bib:list` — List all entries of a given type (e.g., `legal_case`, `chapter`)
- `bib:exists` — Check if an ID exists (fast boolean check before citing)
- `bib:stats` — Entry count total and by type

**Write**
- `bib:add` — Add a new entry with duplicate ID check, required field validation per CSL type, and confirmation output
- `bib:update` — Patch individual fields of an existing entry
- `bib:delete` — Remove an entry by ID

**Validation**
- `bib:validate` — Check entire file: YAML syntax, required fields, duplicate IDs, missing `issued` fields

## Quick Start

```bash
npx @metaneutrons/doc-tools-mcp
```

### MCP Client Configuration

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

All `bib:*` tools require a `file` parameter — the path to the CSL-YAML bibliography file. The LLM discovers this automatically from `bibliography:` in `pandoc.yaml` or the YAML frontmatter of your `.md` files.

## Development

```bash
npm install
npm run build
npm test
```

### Commit Convention

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) enforced via Husky + commitlint.

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`  
**Scopes:** `bib`, `core`, `deps`, `config`

## License

GPL-3.0 — See [LICENSE](LICENSE) for details.
