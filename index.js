import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Regex patterns for each language
// ---------------------------------------------------------------------------

const PATTERNS = [
  // TypeScript/JavaScript
  { exts: ['.ts', '.tsx', '.js', '.jsx'], patterns: [
    /export\s+(default\s+)?(function|class|interface|type|enum|const|abstract\s+class)\s+(\w+)/g,
    /^(\s*)(function|class)\s+(\w+)/gm,
    /(\w+)\s*[=:]\s*(?:async\s+)?(?:function|\()/g,
  ]},
  // Python
  { exts: ['.py'], patterns: [
    /^\s*(async\s+)?def\s+(\w+)\s*\(/gm,
    /^\s*class\s+(\w+)/gm,
  ]},
  // Go
  { exts: ['.go'], patterns: [
    /^func\s+(\w+)/gm,
    /^type\s+(\w+)\s+(struct|interface)/gm,
  ]},
  // Rust
  { exts: ['.rs'], patterns: [
    /^\s*fn\s+(\w+)/gm,
    /^\s*(pub\s+)?(struct|enum|trait|impl\s+\w+|type)\s+(\w+)/gm,
  ]},
  // Java
  { exts: ['.java'], patterns: [
    /\s+(class|interface|enum)\s+(\w+)/g,
    /(public|private|protected)\s+\w+\s+(\w+)\s*\(/g,
  ]},
  // C/C++
  { exts: ['.c', '.h', '.cpp', '.hpp', '.cc'], patterns: [
    /^\s*\w+\s+(\w+)\s*\([^)]*\)\s*\{/gm,
    /^\s*(class|struct|enum)\s+(\w+)/gm,
  ]},
  // Ruby
  { exts: ['.rb'], patterns: [
    /^\s*(def|class|module)\s+(\w+)/gm,
  ]},
  // Swift
  { exts: ['.swift'], patterns: [
    /^\s*(func|class|struct|enum|protocol|extension)\s+(\w+)/gm,
  ]},
  // Kotlin
  { exts: ['.kt', '.kts'], patterns: [
    /^\s*(fun|class|interface|object|data class|sealed class)\s+(\w+)/gm,
  ]},
];

// Directories to skip during walk
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.cache', '__pycache__',
  '.venv', 'target', 'vendor', '.next',
]);

// Source file extensions to analyze
const SOURCE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.c', '.h', '.cpp', '.hpp', '.cc', '.rb', '.swift', '.kt', '.kts',
]);

// ---------------------------------------------------------------------------
// Directory walking
// ---------------------------------------------------------------------------

async function* walkDir(dirPath) {
  let entries;
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.name.startsWith('.')) continue; // skip hidden
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkDir(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

// ---------------------------------------------------------------------------
// Symbol extraction
// ---------------------------------------------------------------------------

function getPatternsForExt(ext) {
  const entry = PATTERNS.find(p => p.exts.includes(ext));
  return entry ? entry.patterns : null;
}

/**
 * Extract symbols from file content using extension-specific regex patterns.
 * Returns array of { name, type, line, col } sorted by line number.
 */
function extractSymbols(content, ext) {
  const patterns = getPatternsForExt(ext);
  if (!patterns) return [];

  const symbols = [];
  const seen = new Set();

  for (const regex of patterns) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      let name = null;
      let type = null;

      if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
        if (match[0].startsWith('export')) {
          // Pattern: export (default )?(keyword) (\w+)
          const groups = match.slice(1).filter(g => g !== undefined);
          name = groups[groups.length - 1];
          // Find the keyword (function, class, interface, etc.)
          const keyword = groups.find(g =>
            ['function', 'class', 'interface', 'type', 'enum', 'const', 'abstract class'].includes(g && g.trim())
          );
          type = keyword ? keyword.trim() : 'symbol';
        } else if (/^\s*(function|class)\s/.test(match[0])) {
          // Pattern 2: (indent)(function|class) (\w+)
          name = match[3] || match[match.length - 1];
          type = match[2] || 'symbol';
        } else {
          // Pattern 3: (\w+) [=:] (async )?(function|()
          name = match[1];
          type = match[0].includes('async') ? 'async function' :
                 match[0].includes('function') ? 'function' : 'variable';
        }
      } else if (ext === '.py') {
        if (match[0].includes('def')) {
          name = match[2] || match[match.length - 1];
          type = match[1] && match[1].trim() === 'async' ? 'async function' : 'function';
        } else {
          name = match[1];
          type = 'class';
        }
      } else if (ext === '.go') {
        if (/^func\s/.test(match[0])) {
          name = match[1];
          type = 'function';
        } else {
          name = match[1];
          type = match[2];
        }
      } else if (ext === '.rs') {
        if (/^\s*fn\s/.test(match[0])) {
          name = match[1];
          type = 'function';
        } else {
          name = match[match.length - 1];
          const kw = match.slice(1).find(g => g && !g.startsWith('pub') && g !== name);
          type = kw ? kw.trim() : 'type';
        }
      } else if (ext === '.java') {
        if (/class|interface|enum/.test(match[0])) {
          name = match[2];
          type = match[1];
        } else {
          name = match[2];
          type = 'method';
        }
      } else if (['.c', '.h', '.cpp', '.hpp', '.cc'].includes(ext)) {
        if (match[1] === 'class' || match[1] === 'struct' || match[1] === 'enum') {
          name = match[2];
          type = match[1];
        } else {
          name = match[1];
          type = 'function';
        }
      } else if (ext === '.rb') {
        name = match[2];
        type = match[1];
      } else if (ext === '.swift') {
        name = match[2];
        type = match[1];
      } else if (ext === '.kt' || ext === '.kts') {
        name = match[match.length - 1];
        const kw = match.slice(1).find(g =>
          ['fun', 'class', 'interface', 'object', 'data class', 'sealed class'].includes(g && g.trim())
        );
        type = kw ? kw.trim() : 'symbol';
      }

      if (!name) continue;

      // Calculate line/col
      const beforeMatch = content.slice(0, match.index);
      const line = (beforeMatch.match(/\n/g) || []).length + 1;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const col = (lastNewline === -1 ? match.index : match.index - lastNewline) + 1;

      // Deduplicate
      const key = `${name}:${line}:${col}`;
      if (seen.has(key)) continue;
      seen.add(key);

      symbols.push({
        name,
        type: type.trim(),
        line,
        col,
      });
    }
  }

  // Sort by line number
  symbols.sort((a, b) => a.line - b.line || a.col - b.col);
  return symbols;
}

// ---------------------------------------------------------------------------
// Tool 1: map_codebase
// ---------------------------------------------------------------------------

async function mapCodebase(rootPath, maxFiles = 30) {
  const results = [];

  for await (const filePath of walkDir(rootPath)) {
    if (results.length >= maxFiles) break;

    const ext = path.extname(filePath);
    if (!SOURCE_EXTS.has(ext)) continue;

    let content;
    try {
      content = await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const symbols = extractSymbols(content, ext);
    if (symbols.length === 0) continue;

    const displaySymbols = symbols.slice(0, 50);
    results.push({ file: filePath, symbols: displaySymbols });
  }

  results.sort((a, b) => a.file.localeCompare(b.file));

  const lines = [];
  for (const { file, symbols } of results) {
    lines.push(`${file} (${symbols.length} symbols):`);
    for (const sym of symbols) {
      lines.push(`  └─ ${sym.name} [${sym.type}] :${sym.line}:${sym.col}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tool 2: find_symbol
// ---------------------------------------------------------------------------

async function findSymbol(symbol, searchPath) {
  const searchRoot = searchPath || process.cwd();

  let filesToSearch = [];

  try {
    const stat = await fs.promises.stat(searchRoot);
    if (stat.isFile()) {
      filesToSearch = [searchRoot];
    } else {
      for await (const filePath of walkDir(searchRoot)) {
        const ext = path.extname(filePath);
        if (SOURCE_EXTS.has(ext)) {
          filesToSearch.push(filePath);
        }
        if (filesToSearch.length > 500) break;
      }
    }
  } catch {
    return 'Error: path not found';
  }

  const definitions = [];
  const references = [];
  const totalLimit = 50;

  for (const filePath of filesToSearch) {
    if (definitions.length + references.length >= totalLimit) break;

    let content;
    try {
      content = await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const ext = path.extname(filePath);
    const lines = content.split('\n');

    // Find definitions using extractSymbols
    const extSymbols = extractSymbols(content, ext);
    for (const sym of extSymbols) {
      if (definitions.length + references.length >= totalLimit) break;
      if (sym.name === symbol) {
        definitions.push({ file: filePath, symbol: sym });
      }
    }

    // Find usages (any line mentioning the symbol)
    for (let i = 0; i < lines.length; i++) {
      if (definitions.length + references.length >= totalLimit) break;
      const line = lines[i];
      if (!line.includes(symbol)) continue;

      // Skip if already counted as a definition on this line
      const isAlreadyDef = definitions.some(
        d => d.file === filePath && d.symbol.line === i + 1
      );
      if (isAlreadyDef) continue;

      const trimmed = line.trim();
      references.push({
        file: filePath,
        line: i + 1,
        col: trimmed.indexOf(symbol) + 1,
        text: trimmed,
      });
    }
  }

  const outputLines = [];

  outputLines.push('DEFINITIONS:');
  if (definitions.length === 0) {
    outputLines.push('  (none found)');
  } else {
    for (const d of definitions) {
      outputLines.push(`  ${d.file}:${d.symbol.line}:${d.symbol.col}  ${d.symbol.name} [${d.symbol.type}]`);
    }
  }

  outputLines.push('');
  outputLines.push('REFERENCES:');
  if (references.length === 0) {
    outputLines.push('  (none found)');
  } else {
    for (const r of references) {
      outputLines.push(`  ${r.file}:${r.line}:${r.col}  ${r.text}`);
    }
  }

  return outputLines.join('\n');
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const rawLine of rl) {
  const line = rawLine.trim();
  if (!line) continue;

  let request;
  try {
    request = JSON.parse(line);
  } catch {
    continue;
  }

  const { method, id, params } = request;

  try {
    let response;

    switch (method) {
      case 'initialize': {
        response = {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params?.protocolVersion || '2025-03-26',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: '@brick/extension-repomap',
              version: '0.1.0',
            },
          },
        };
        break;
      }

      case 'tools/list': {
        response = {
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'map_codebase',
                description: 'Scans a codebase directory and extracts symbol structure',
                inputSchema: {
                  type: 'object',
                  properties: {
                    path: {
                      type: 'string',
                      description: 'Directory to analyze',
                    },
                    maxFiles: {
                      type: 'number',
                      description: 'Max files to report (default: 30)',
                    },
                  },
                  required: ['path'],
                },
              },
              {
                name: 'find_symbol',
                description: 'Searches for a specific symbol definition across the codebase',
                inputSchema: {
                  type: 'object',
                  properties: {
                    symbol: {
                      type: 'string',
                      description: 'Symbol name to find',
                    },
                    path: {
                      type: 'string',
                      description: 'Limit search to specific file or directory',
                    },
                  },
                  required: ['symbol'],
                },
              },
            ],
          },
        };
        break;
      }

      case 'tools/call': {
        const toolName = params?.name;
        const args = params?.arguments || {};

        let result;

        if (toolName === 'map_codebase') {
          if (!args.path) {
            throw new Error('Missing required parameter: path');
          }
          const rootPath = path.resolve(args.path);
          const maxFiles = args.maxFiles || 30;
          result = await mapCodebase(rootPath, maxFiles);
        } else if (toolName === 'find_symbol') {
          if (!args.symbol) {
            throw new Error('Missing required parameter: symbol');
          }
          const searchPath = args.path ? path.resolve(args.path) : undefined;
          result = await findSymbol(args.symbol, searchPath);
        } else {
          throw new Error(`Unknown tool: ${toolName}`);
        }

        response = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: result,
              },
            ],
          },
        };
        break;
      }

      case 'notifications/initialized': {
        continue;
      }

      default: {
        response = {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
        break;
      }
    }

    process.stdout.write(JSON.stringify(response) + '\n');
  } catch (err) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code: -32603,
        message: err.message || 'Internal error',
      },
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  }
}