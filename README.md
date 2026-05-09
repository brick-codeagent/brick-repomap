# Brick Repomap Extension

A Brick extension for codebase mapping and symbol search.

## Installation

```bash
brick install ./extension-repomap
```

## Tools

| Tool | Description |
|------|-------------|
| `map_codebase(path, maxFiles?)` | Scan directory for symbol structure |
| `find_symbol(symbol, path?)` | Search codebase for symbol definitions and usages |

## Supported Languages

TypeScript, JavaScript, Python, Go, Rust, Java, C/C++, Ruby, Swift, Kotlin

## How it works

- Pure regex-based analysis (no external dependencies)
- Detects functions, classes, interfaces, types, enums, structs, traits
- Intelligent deduplication of symbol matches