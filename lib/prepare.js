// SPDX-License-Identifier: (GPL-2.0-only OR BSD-2-Clause)
/*@flow*/
import fs from 'fs';
import YAML from 'yaml';

import Ajv2020 from 'ajv/dist/2020.js';
import betterAjvErrors from 'better-ajv-errors';
import { fileURLToPath } from 'url';
import path from 'path';

import { transform } from './transform.js';

/*::
import type { Object_t } from  './types.js';
*/

const __filename = fileURLToPath((import.meta.url /*:any*/));
const __dirname = path.dirname(__filename);


// helper: walk doc nodes following an Ajv instancePath like "/fields/0/type"
function findNodeByInstancePath(doc /*:any*/, instancePath /*:string*/) {
  // split '/a/b/0/c' -> ['a','b','0','c']
  const parts = instancePath.split('/').filter(Boolean);
  let node = doc.contents; // root AST node (YAMLMap / YAMLSeq / Scalar)

  for (const part of parts) {
    if (!node) return null;

    // mapping (object)
    if (node?.type === 'MAP' || node?.type === 'YAMLMap' || node?.items) {
      // YAMLMap has get(key, keepScalar) to get Pair value by key
      // prefer Node API: node.get(key, true)
      try {
        // .get exists on YAMLMap; second arg true returns the Node not a JS value
        node = node.get ? node.get(part, true) : null;
        // when get returns a Pair for a map key, take .value
        if (node && node.type === 'PAIR') node = node.value ?? node.get?.(part, true);
      } catch (e) {
        node = null;
      }
    }
    // sequence (array)
    else if (node?.type === 'SEQ' || Array.isArray(node.items)) {
      const idx = Number(part);
      if (Number.isFinite(idx) && node.items && node.items[idx]) node = node.items[idx];
      else { node = null; }
    }
    // scalar or other: nothing to descend into
    else {
      node = null;
    }
  }

  return node ?? null;
}


// helper: get human-friendly position and snippet from node
function posAndSnippet(node /*:any*/, src /*:string*/) {
  if (!node) return { pos: 'unknown', snippet: '' };

  // CST node or range info:
  const cst = node.cstNode ?? node?.srcToken ?? null;

  // modern versions expose rangeAsLinePos on CST nodes; fallback to .range
  const linepos = cst?.rangeAsLinePos?.start ?? node?.rangeAsLinePos?.start ?? null;

  if (linepos) {
    const { line, col } = linepos;
    // grab the line text for a snippet (lines are 1-based)
    const lines = src.split(/\r?\n/);
    const textLine = lines[line - 1] ?? '';
    return { pos: `${line}:${col}`, snippet: textLine.trim() };
  }

  // fallback: maybe node.range exists (indexes into src)
  if (node.range && node.range[0] != null) {
    const start = node.range[0];
    // compute approximate line/col from start index
    const upto = src.slice(0, start).split(/\r?\n/);
    const line = upto.length;
    const col = upto[upto.length - 1].length + 1;
    const textLine = src.split(/\r?\n/)[line - 1] ?? '';
    return { pos: `${line}:${col}`, snippet: textLine.trim() };
  }

  return { pos: 'unknown', snippet: '' };
}

export function prepare(yaml_s /*:string*/) /*:?Object_t*/ {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const schema = YAML.parse(fs.readFileSync(path.join(__dirname, 'schema.yaml'), 'utf8'));
    const validate = ajv.compile(schema);

    // const doc = parseDocument(yaml_s, { keepCstNodes: true, keepNodeTypes: true });
    const doc = YAML.parseDocument(yaml_s, {
        keepCstNodes: true,    // important: attach CST nodes to AST nodes
        keepNodeTypes: true,   // keep original node types (helpful)
    });
    const data = doc.toJS();

    if (validate(data)) {
        transform(data);
        return data;
    }

    // 4) map Ajv errors to YAML positions
    for (const err of validate.errors || []) {
        const instPath = err.instancePath || ''; // Ajv path, e.g. "/fields/0/type"
        const node = findNodeByInstancePath(doc, instPath);
        const { pos, snippet } = posAndSnippet(node, yaml_s);

        console.error(`${err.message} at ${pos} (path: ${instPath})`);
        if (snippet) {
            console.error('  source:', snippet);
        } else {
            console.error('  (no source snippet available)');
        }
        console.error('')
    }
    return null;
}