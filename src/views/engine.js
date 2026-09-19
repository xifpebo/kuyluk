'use strict';

/**
 * Minimal logic-less HTML template engine with auto-escaping.
 *
 *   {{t:key.path}}        translated text (escaped)
 *   {{v:path}}            context value (escaped)
 *   {{raw:path}}          trusted, pre-rendered HTML from the context
 *   {{json:path}}         JSON safe to embed inside <script type="application/*json">
 *   {{asset:/css/x.css}}  cache-busted asset URL
 *   {{active:name}}       aria-current="page" when ctx.page === name
 *   {{lang:ru}}           current URL switched to another language
 *   {{> partial-name}}    include views/partials/<name>.html
 *   {{#if path}}…{{else}}…{{/if}}   {{#unless path}}…{{/unless}}
 *
 * Templates are authored by developers; user data only ever flows through
 * the escaping tokens.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const i18n = require('../i18n');

const VIEWS_DIR = __dirname;
const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[&<>"'`]/g, (ch) => ESCAPES[ch]);
}

function safeJson(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u{2028}/gu, '\\u2028')
    .replace(/\u{2029}/gu, '\\u2029');
}

function getValue(ctx, dotted) {
  let node = ctx;
  for (const part of dotted.split('.')) {
    if (node === null || node === undefined) return undefined;
    node = node[part];
  }
  return node;
}

// Split children at the {{else}} marker into then/else branches (recursively).
function normaliseTree(node) {
  if (!node.children) return node;
  const rebuilt = { ...node, children: [], elseChildren: [] };
  let inElse = false;
  for (const child of node.children) {
    if (child === ELSE_MARKER) {
      inElse = true;
      continue;
    }
    const normalised = normaliseTree(child);
    if (inElse) rebuilt.elseChildren.push(normalised);
    else rebuilt.children.push(normalised);
  }
  return rebuilt;
}
const ELSE_MARKER = Symbol('else');

function createEngine({ cache = true, assetRoot, assetVersion } = {}) {
  const compiled = new Map();
  const assetHashes = new Map();

  function load(relative) {
    if (cache && compiled.has(relative)) return compiled.get(relative);
    const file = path.join(VIEWS_DIR, `${relative}.html`);
    const source = fs.readFileSync(file, 'utf8');
    const tree = compile(source, relative);
    if (cache) compiled.set(relative, tree);
    return tree;
  }

  function compile(source, name) {
    // Parse with an explicit else marker so nested blocks stay correct.
    const root = { type: 'root', children: [] };
    const stack = [root];
    let last = 0;
    const current = () => stack[stack.length - 1];
    for (const match of source.matchAll(TOKEN)) {
      if (match.index > last) current().children.push({ type: 'text', value: source.slice(last, match.index) });
      last = match.index + match[0].length;
      const token = match[1];
      if (token.startsWith('#if ') || token.startsWith('#unless ')) {
        const spaceAt = token.indexOf(' ');
        const node = { type: 'if', negate: token.startsWith('#unless'), expr: token.slice(spaceAt + 1).trim(), children: [] };
        current().children.push(node);
        stack.push(node);
      } else if (token === 'else') {
        if (current().type !== 'if') throw new Error(`Template ${name}: {{else}} outside of a block`);
        current().children.push(ELSE_MARKER);
      } else if (token === '/if' || token === '/unless') {
        const node = stack.pop();
        if (!node || node.type !== 'if') throw new Error(`Template ${name}: unexpected {{${token}}}`);
      } else if (token.startsWith('>')) {
        current().children.push({ type: 'partial', name: token.slice(1).trim() });
      } else {
        const index = token.indexOf(':');
        if (index < 1) throw new Error(`Template ${name}: invalid token {{${token}}}`);
        current().children.push({ type: 'tag', kind: token.slice(0, index), arg: token.slice(index + 1).trim() });
      }
    }
    if (last < source.length) current().children.push({ type: 'text', value: source.slice(last) });
    if (stack.length !== 1) throw new Error(`Template ${name}: unclosed block`);
    return normaliseTree(root);
  }

  function assetUrl(urlPath) {
    if (!assetRoot) return urlPath;
    if (assetVersion) return `${urlPath}?v=${assetVersion}`;
    let hash = cache ? assetHashes.get(urlPath) : undefined;
    if (!hash) {
      try {
        const content = fs.readFileSync(path.join(assetRoot, urlPath));
        hash = crypto.createHash('sha1').update(content).digest('hex').slice(0, 10);
      } catch {
        hash = 'missing';
      }
      if (cache) assetHashes.set(urlPath, hash);
    }
    return `${urlPath}?v=${hash}`;
  }

  function renderNodes(nodes, ctx, out) {
    for (const node of nodes) {
      switch (node.type) {
        case 'text':
          out.push(node.value);
          break;
        case 'if': {
          let value = getValue(ctx, node.expr);
          if (Array.isArray(value)) value = value.length > 0;
          const truthy = Boolean(value) !== node.negate;
          renderNodes(truthy ? node.children : node.elseChildren, ctx, out);
          break;
        }
        case 'partial':
          renderNodes(load(`partials/${node.name}`).children, ctx, out);
          break;
        case 'tag':
          out.push(renderTag(node, ctx));
          break;
        default:
          break;
      }
    }
  }

  function renderTag({ kind, arg }, ctx) {
    switch (kind) {
      case 't':
        return escapeHtml(i18n.t(ctx.lang, arg));
      case 'v':
        return escapeHtml(getValue(ctx, arg));
      case 'raw': {
        const value = getValue(ctx, arg);
        return value === undefined || value === null ? '' : String(value);
      }
      case 'json':
        return safeJson(getValue(ctx, arg));
      case 'asset':
        return escapeHtml(assetUrl(arg));
      case 'active':
        return ctx.page === arg || ctx.section === arg ? ' aria-current="page"' : '';
      case 'lang':
        return escapeHtml(ctx.langUrls ? ctx.langUrls[arg] : `?lang=${arg}`);
      default:
        throw new Error(`Unknown template tag "${kind}"`);
    }
  }

  function render(name, ctx) {
    const out = [];
    renderNodes(load(name).children, ctx, out);
    return out.join('');
  }

  function renderPage(page, ctx) {
    const body = render(`pages/${page}`, ctx);
    return render(`layouts/${ctx.layout || 'site'}`, { ...ctx, body });
  }

  return { render, renderPage, assetUrl, escapeHtml };
}

module.exports = { createEngine, escapeHtml, safeJson };
