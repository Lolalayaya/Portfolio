#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function parseHeading(raw) {
  const attrMatch = raw.match(/\s+\{([^}]+)\}\s*$/);
  const attrs = { id: "", className: "" };
  let text = raw.trim();

  if (attrMatch) {
    text = raw.slice(0, attrMatch.index).trim();
    attrMatch[1].split(/\s+/).forEach((part) => {
      if (part.startsWith("#")) attrs.id = part.slice(1);
      if (part.startsWith(".")) attrs.className = part.slice(1);
    });
  }

  if (!attrs.id) attrs.id = slugify(text);
  return { text, ...attrs };
}

function inline(value) {
  let html = escapeHtml(value);
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_, alt, src, title) => {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${titleAttr}>`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  return html;
}

function parseBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, ...parseHeading(heading[2]) });
      i += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: quote.join(" ") });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    if (/^\|.+\|$/.test(line.trim())) {
      const rows = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        rows.push(lines[i].trim());
        i += 1;
      }
      blocks.push({
        type: "table",
        rows: rows
          .filter((row) => !/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|$/.test(row))
          .map((row) => row.slice(1, -1).split("|").map((cell) => cell.trim())),
      });
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !lines[i].startsWith(">") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\|.+\|$/.test(lines[i].trim())
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function splitDocument(blocks) {
  const hero = { title: "Generated Page", blocks: [] };
  const sections = [];
  let current = null;

  blocks.forEach((block) => {
    if (block.type === "heading" && block.level === 1 && hero.title === "Generated Page") {
      hero.title = block.text;
      return;
    }
    if (block.type === "heading" && block.level === 2) {
      current = { ...block, blocks: [] };
      sections.push(current);
      return;
    }
    if (block.type === "hr") return;
    if (current) current.blocks.push(block);
    else hero.blocks.push(block);
  });

  return { hero, sections };
}

function renderBlock(block) {
  if (block.type === "heading") return `<h${block.level}>${inline(block.text)}</h${block.level}>`;
  if (block.type === "quote") return `<blockquote>${inline(block.text)}</blockquote>`;
  if (block.type === "paragraph") return `<p>${inline(block.text)}</p>`;
  if (block.type === "list") {
    const tag = block.ordered ? "ol" : "ul";
    return `<${tag}>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
  }
  if (block.type === "table") {
    const [head = [], ...body] = block.rows;
    return `<div class="table-wrap"><table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  return "";
}

function renderPage(markdown, titleOverride) {
  const { hero, sections } = splitDocument(parseBlocks(markdown));
  const title = titleOverride || hero.title;
  const nav = sections.map((section) => `<a href="#${section.id}">${escapeHtml(section.text)}</a>`).join("");
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{--ink:#171717;--paper:#fbfaf7;--muted:#5f6368;--line:#d9d4c8;--accent:#2251ff;--card:#fff}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,Arial,sans-serif;line-height:1.65}a{color:inherit}img{max-width:100%;border-radius:8px}.wrap{max-width:1040px;margin:0 auto;padding:0 24px}nav{position:sticky;top:0;background:rgba(251,250,247,.94);border-bottom:1px solid var(--line);backdrop-filter:blur(10px);z-index:2}nav .wrap{display:flex;justify-content:space-between;gap:20px;align-items:center;min-height:64px}.brand{font-weight:800;text-decoration:none}.links{display:flex;gap:14px;flex-wrap:wrap;font-size:14px}.links a{text-decoration:none;color:var(--muted)}.hero{padding:88px 0 72px;background:#101010;color:white}.hero h1{font-size:clamp(38px,7vw,76px);line-height:1.02;max-width:880px;margin:16px 0}.hero p{max-width:720px;font-size:19px;color:#ddd}.hero blockquote,.tag{display:inline-block;margin:0 0 12px;padding:6px 12px;border:1px solid rgba(255,255,255,.35);border-radius:999px;color:white}section{padding:72px 0;border-bottom:1px solid var(--line)}h2{font-size:clamp(28px,4vw,44px);line-height:1.1;margin:0 0 22px}h3{font-size:24px;margin:30px 0 10px}p{margin:0 0 14px;color:var(--muted)}ul,ol{padding-left:24px;color:var(--muted)}li{margin:7px 0}blockquote{margin:0 0 18px;padding:10px 14px;border-left:4px solid var(--accent);background:var(--card);color:var(--ink)}.content{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}.table-wrap{overflow:auto;margin:22px 0}table{width:100%;border-collapse:collapse;background:var(--card)}th,td{border:1px solid var(--line);padding:12px;text-align:left;vertical-align:top}th{background:#f0eee8;color:var(--ink)}footer{padding:40px 0;color:var(--muted);font-size:14px}@media(max-width:760px){.links{display:none}.hero{padding:64px 0}.wrap{padding:0 18px}section{padding:54px 0}}
</style>
</head>
<body>
<nav><div class="wrap"><a class="brand" href="#">${escapeHtml(title)}</a><div class="links">${nav}</div></div></nav>
<main>
<header class="hero"><div class="wrap">${hero.blocks.map(renderBlock).join("")}<h1>${inline(hero.title)}</h1></div></header>
${sections.map((section) => `<section id="${section.id}" class="${escapeHtml(section.className)}"><div class="wrap"><h2>${inline(section.text)}</h2><div class="content">${section.blocks.map(renderBlock).join("")}</div></div></section>`).join("\n")}
</main>
<footer><div class="wrap">Generated from Markdown.</div></footer>
</body>
</html>
`;
}

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.output) {
  console.error("Usage: node scripts/generate_markdown_site.js --input content.md --output index.html [--title \"Page Title\"]");
  process.exit(1);
}

const inputPath = path.resolve(args.input);
const outputPath = path.resolve(args.output);
const markdown = fs.readFileSync(inputPath, "utf8");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, renderPage(markdown, args.title), "utf8");
console.log(`[generated] ${inputPath} -> ${outputPath}`);
