const fs = require("fs");
const path = require("path");
const http = require("http");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "content.md");
const outputPath = path.join(root, "index.html");
const port = Number(process.env.PORT || 5173);
const isWatch = process.argv.includes("--watch");
const isServe = process.argv.includes("--serve");

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
      const parsed = parseHeading(heading[2]);
      blocks.push({ type: "heading", level: heading[1].length, ...parsed });
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
      const cleaned = rows
        .filter((row) => !/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|$/.test(row))
        .map((row) => row.slice(1, -1).split("|").map((cell) => cell.trim()));
      blocks.push({ type: "table", rows: cleaned });
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
  const firstH1Index = blocks.findIndex((block) => block.type === "heading" && block.level === 1);
  const hero = { title: "Portfolio", blocks: [] };
  const sections = [];
  let current = null;

  blocks.forEach((block, index) => {
    if (index === firstH1Index) {
      hero.title = block.text;
      return;
    }
    if (block.type === "heading" && block.level === 2) {
      current = { ...block, blocks: [] };
      sections.push(current);
      return;
    }
    if (!current) {
      if (block.type !== "hr") hero.blocks.push(block);
      return;
    }
    if (block.type !== "hr") current.blocks.push(block);
  });

  return { hero, sections };
}

function renderBlock(block) {
  if (block.type === "heading") return `<h${block.level}>${inline(block.text)}</h${block.level}>`;
  if (block.type === "quote") return `<span class="tag">${inline(block.text)}</span>`;
  if (block.type === "paragraph") {
    const onlyImage = block.text.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)$/);
    if (onlyImage) return `<figure>${inline(block.text)}</figure>`;
    return `<p>${inline(block.text)}</p>`;
  }
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

function renderCtas(listBlock) {
  if (!listBlock || listBlock.type !== "list") return "";
  const links = listBlock.items.map((item, index) => {
    const match = item.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!match) return "";
    return `<a href="${escapeHtml(match[2])}" class="btn ${index === 0 ? "solid" : "ghost"}">${escapeHtml(match[1])}</a>`;
  }).join("");
  return links ? `<div class="cta">${links}</div>` : "";
}

function renderHero(hero) {
  const tag = hero.blocks.find((block) => block.type === "quote");
  const paragraphs = hero.blocks.filter((block) => block.type === "paragraph");
  const list = hero.blocks.find((block) => block.type === "list");
  const table = hero.blocks.find((block) => block.type === "table");
  return `<section class="hero" id="home"><div class="wrap">${tag ? renderBlock(tag) : ""}<h1>${inline(hero.title)}</h1>${paragraphs.map(renderBlock).join("")}${renderCtas(list)}${table ? `<div class="hero-drift">${table.rows[0].map((head, index) => `<span>${inline(head)}: ${inline((table.rows[1] || [])[index] || "")}</span>`).join("")}</div>` : ""}</div></section>`;
}

function collectCards(section) {
  const cards = [];
  let current = null;
  section.blocks.forEach((block) => {
    if (block.type === "heading" && block.level === 3) {
      current = { title: block.text, blocks: [] };
      cards.push(current);
    } else if (current) {
      current.blocks.push(block);
    }
  });
  return cards;
}

function renderAbout(section) {
  const title = section.blocks.find((block) => block.type === "heading" && block.level === 3);
  const paragraphs = section.blocks.filter((block) => block.type === "paragraph" && !block.text.startsWith("!["));
  const skills = section.blocks.find((block) => block.type === "list");
  const image = section.blocks.find((block) => block.type === "paragraph" && block.text.startsWith("!["));
  return `<section id="${section.id}" class="${section.className}"><div class="wrap about-grid"><div>${section.blocks.find((block) => block.type === "quote") ? renderBlock(section.blocks.find((block) => block.type === "quote")) : ""}<h2>${title ? inline(title.text) : inline(section.text)}</h2>${paragraphs.map(renderBlock).join("")}${skills ? `<div class="skills">${skills.items.map((item) => `<span class="skill-pill">${inline(item)}</span>`).join("")}</div>` : ""}</div><div class="about-photo">${image ? inline(image.text) : "Add image in Markdown"}</div></div></section>`;
}

function renderCardSection(section, kind) {
  const cards = collectCards(section);
  const tag = section.blocks.find((block) => block.type === "quote");
  const gridClass = kind === "philosophy" ? "phi-grid" : kind === "projects" ? "proj-grid" : kind === "playground" ? "pg-grid" : "journal-list";
  const cardHtml = cards.map((card, index) => {
    const text = card.blocks.find((block) => block.type === "paragraph" && !block.text.startsWith("!["));
    const image = card.blocks.find((block) => block.type === "paragraph" && block.text.startsWith("!["));
    if (kind === "philosophy") return `<div class="phi-card"><div class="phi-num">${String(index + 1).padStart(2, "0")}</div><h3>${inline(card.title)}</h3>${text ? renderBlock(text) : ""}</div>`;
    if (kind === "projects") return `<article class="proj-card"><div class="proj-thumb">${image ? inline(image.text) : "Project image"}</div><div class="proj-body"><h3>${inline(card.title)}</h3>${text ? renderBlock(text) : ""}</div></article>`;
    if (kind === "journal") return `<article class="journal-item"><h3>${inline(card.title)}</h3><span>${text ? inline(text.text) : ""}</span></article>`;
    return `<article class="pg-card"><h3>${inline(card.title)}</h3>${text ? renderBlock(text) : ""}</article>`;
  }).join("");
  return `<section id="${section.id}" class="${section.className}"><div class="wrap">${tag ? renderBlock(tag) : ""}<h2>${inline(section.text)}</h2><div class="${gridClass}">${cardHtml}</div></div></section>`;
}

function renderProcess(section) {
  const tag = section.blocks.find((block) => block.type === "quote");
  const steps = section.blocks.find((block) => block.type === "list" && block.ordered);
  const items = steps ? steps.items.map((item) => {
    const match = item.match(/^\*\*([^*]+)\*\*\s+-\s+(.+)$/);
    const title = match ? match[1] : item;
    const body = match ? match[2] : "";
    return `<details class="process-step"><summary>${inline(title)} <span class="plus">+</span></summary><p>${inline(body)}</p></details>`;
  }).join("") : "";
  return `<section id="${section.id}" class="${section.className}"><div class="wrap">${tag ? renderBlock(tag) : ""}<h2>${inline(section.text)}</h2><div class="process-list">${items}</div></div></section>`;
}

function renderLife(section) {
  const tag = section.blocks.find((block) => block.type === "quote");
  const table = section.blocks.find((block) => block.type === "table");
  const heads = table ? table.rows[0] : [];
  const desc = table ? table.rows[1] || [] : [];
  return `<section id="${section.id}" class="${section.className}"><div class="wrap">${tag ? renderBlock(tag) : ""}<h2>${inline(section.text)}</h2><div class="life-grid">${heads.map((head, index) => `<article class="life-card"><div class="ic">${escapeHtml(head.slice(0, 1))}</div><h4>${inline(head)}</h4><p>${inline(desc[index] || "")}</p></article>`).join("")}</div></div></section>`;
}

function renderContact(section) {
  const tag = section.blocks.find((block) => block.type === "quote");
  const title = section.blocks.find((block) => block.type === "heading" && block.level === 3);
  const paragraph = section.blocks.find((block) => block.type === "paragraph");
  const links = section.blocks.find((block) => block.type === "list");
  return `<section id="${section.id}" class="${section.className}"><div class="wrap">${tag ? renderBlock(tag) : ""}<h2>${inline(section.text)}</h2><div class="contact-box"><div class="msg them">${title ? inline(title.text) : "Hello"}</div>${paragraph ? `<div class="msg me">${inline(paragraph.text)}</div>` : ""}${links ? `<div class="contact-links">${links.items.map((item) => `<span>${inline(item)}</span>`).join("")}</div>` : ""}</div></div></section>`;
}

function renderGeneric(section) {
  const tag = section.blocks.find((block) => block.type === "quote");
  const body = section.blocks.filter((block) => block !== tag).map(renderBlock).join("");
  return `<section id="${section.id}" class="${section.className}"><div class="wrap">${tag ? renderBlock(tag) : ""}<h2>${inline(section.text)}</h2><div class="markdown-body">${body}</div></div></section>`;
}

function renderSection(section) {
  if (section.className === "about") return renderAbout(section);
  if (section.className === "philosophy") return renderCardSection(section, "philosophy");
  if (section.className === "projects") return renderCardSection(section, "projects");
  if (section.className === "process") return renderProcess(section);
  if (section.className === "playground") return renderCardSection(section, "playground");
  if (section.className === "journal") return renderCardSection(section, "journal");
  if (section.className === "life") return renderLife(section);
  if (section.className === "contact") return renderContact(section);
  return renderGeneric(section);
}

function css() {
  return `
:root{--ink:#111;--paper:#faf7f2;--accent:#ff4d2e;--accent2:#2e5eff;--accent3:#ffd23f;--card:#fff;--muted:#555}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:Inter,Arial,sans-serif;background:var(--paper);color:var(--ink);line-height:1.6}
h1,h2,h3,h4,.brand{font-family:"Space Grotesk",Inter,Arial,sans-serif;line-height:1.15}
a{color:inherit;text-decoration:none}
img{display:block;width:100%;height:100%;object-fit:cover}
.wrap{max-width:1100px;margin:0 auto;padding:0 24px}
nav{position:sticky;top:0;z-index:50;background:var(--paper);border-bottom:3px solid var(--ink)}
nav .wrap{display:flex;justify-content:space-between;align-items:center;min-height:72px;gap:24px}
.brand{font-weight:700;font-size:20px}
.navlinks{display:flex;gap:10px;list-style:none;font-weight:700;font-size:14px;flex-wrap:wrap}
.navlinks a{display:block;padding:7px 11px;border-radius:100px}
.navlinks a:hover{background:var(--ink);color:var(--paper)}
section{padding:88px 0;border-bottom:3px solid var(--ink)}
section:last-of-type{border-bottom:none}
.tag{display:inline-block;font-size:13px;font-weight:700;background:var(--accent3);border:2px solid var(--ink);padding:4px 12px;border-radius:100px;margin-bottom:20px;color:var(--ink)}
h2{font-size:clamp(28px,4vw,44px);margin-bottom:22px}
p{font-size:17px;color:var(--muted);margin:0 0 14px}
.hero{background:var(--accent2);color:var(--paper)}
.hero h1{font-size:clamp(38px,7vw,72px);max-width:880px}
.hero p{color:rgba(255,255,255,.88);font-size:19px;max-width:680px;margin-top:22px}
.cta{display:flex;gap:14px;flex-wrap:wrap;margin-top:34px}
.btn{padding:14px 24px;border-radius:100px;font-weight:800;border:2px solid var(--paper)}
.btn.solid{background:var(--paper);color:var(--accent2)}
.btn.ghost:hover,.btn.solid:hover{background:var(--ink);border-color:var(--ink);color:var(--paper)}
.hero-drift{display:flex;gap:12px;flex-wrap:wrap;margin-top:46px}
.hero-drift span{border:1px solid var(--paper);padding:7px 14px;border-radius:100px;font-size:14px}
.about-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:56px;align-items:start}
.skills{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.skill-pill{background:var(--card);border:2px solid var(--ink);padding:8px 16px;border-radius:100px;font-size:14px;font-weight:800}
.about-photo{background:var(--accent);border:3px solid var(--ink);border-radius:16px;aspect-ratio:3/4;overflow:hidden;display:flex;align-items:center;justify-content:center;color:var(--paper);font-weight:800}
.about-photo img[src$=".jpg"],.proj-thumb img[src$=".jpg"]{background:rgba(255,255,255,.24)}
.philosophy{background:var(--ink);color:var(--paper)}
.philosophy p{color:#ccc}
.phi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:2px;margin-top:28px;background:var(--paper)}
.phi-card{background:var(--ink);padding:30px}
.phi-num{font-size:14px;font-weight:800;color:var(--accent3)}
.phi-card h3{font-size:22px;margin:12px 0 10px}
.proj-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;margin-top:28px}
.proj-card{border:3px solid var(--ink);border-radius:16px;overflow:hidden;background:var(--card);transition:.2s}
.proj-card:hover{transform:translate(-4px,-4px);box-shadow:8px 8px 0 var(--ink)}
.proj-thumb{height:220px;background:var(--accent2);display:flex;align-items:center;justify-content:center;color:var(--paper);font-weight:800;border-bottom:3px solid var(--ink);overflow:hidden}
.proj-card:nth-child(2) .proj-thumb{background:var(--accent)}
.proj-card:nth-child(3) .proj-thumb{background:var(--accent3);color:var(--ink)}
.proj-card:nth-child(4) .proj-thumb{background:#6f5cff}
.proj-body{padding:24px}
.proj-body h3{font-size:21px;margin-bottom:8px}
.process-list{display:flex;flex-direction:column;gap:2px;margin-top:28px}
.process-step{border:2px solid var(--ink);border-radius:12px;padding:20px 24px;background:var(--card)}
.process-step summary{list-style:none;display:flex;justify-content:space-between;gap:20px;font-weight:800;font-size:18px;cursor:pointer}
.process-step summary::-webkit-details-marker{display:none}
.process-step[open] .plus{transform:rotate(45deg)}
.playground{background:var(--accent3)}
.pg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:28px}
.pg-card{border:2px dashed var(--ink);border-radius:12px;padding:24px;min-height:170px;background:rgba(255,255,255,.42)}
.pg-card h3{font-size:19px;margin-bottom:12px}
.journal-list{margin-top:28px}
.journal-item{display:flex;justify-content:space-between;gap:24px;padding:24px 0;border-bottom:2px solid var(--ink)}
.journal-item:first-child{border-top:2px solid var(--ink)}
.journal-item h3{font-size:19px}
.journal-item span{font-size:13px;color:#777;font-weight:700;white-space:nowrap}
.life{background:var(--accent2);color:var(--paper)}
.life p{color:rgba(255,255,255,.82)}
.life-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-top:28px}
.life-card{border:2px solid var(--paper);border-radius:12px;padding:18px 16px;aspect-ratio:1/1;display:flex;flex-direction:column;justify-content:space-between}
.life-card:hover{background:var(--paper);color:var(--accent2)}
.life-card:hover p{color:var(--accent2)}
.ic{font-size:28px;font-weight:900}
.contact-box{margin-top:34px;border:3px solid var(--ink);border-radius:16px;background:var(--card);max-width:640px;padding:24px}
.msg{padding:12px 16px;border-radius:12px;margin-bottom:12px;font-size:15px;max-width:88%}
.msg.them{background:#eee;border-bottom-left-radius:2px;font-weight:800}
.msg.me{background:var(--accent2);color:var(--paper);margin-left:auto;border-bottom-right-radius:2px}
.contact-links{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.contact-links span{border:2px solid var(--ink);border-radius:100px;padding:9px 14px;font-weight:800}
.table-wrap{overflow:auto;margin:22px 0}
table{width:100%;border-collapse:collapse;background:var(--card)}
th,td{border:2px solid var(--ink);padding:12px;text-align:left}
blockquote{border-left:4px solid var(--ink);padding-left:16px}
figure{border:3px solid var(--ink);border-radius:16px;overflow:hidden;background:var(--card)}
footer{padding:44px 0;text-align:center;font-size:14px;color:#777}
@media(max-width:768px){.about-grid,.proj-grid,.phi-grid,.pg-grid{grid-template-columns:1fr}.life-grid{grid-template-columns:repeat(2,1fr)}.navlinks{display:none}.journal-item{display:block}.journal-item span{display:block;margin-top:8px}.wrap{padding:0 18px}section{padding:64px 0}}
`;
}

function renderPage(markdown) {
  const { hero, sections } = splitDocument(parseBlocks(markdown));
  const nav = sections.map((section) => `<li><a href="#${section.id}">${escapeHtml(section.text)}</a></li>`).join("");
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(hero.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>${css()}</style>
</head>
<body>
<nav><div class="wrap"><a class="brand" href="#home">${escapeHtml(hero.title.replace(/\s+Portfolio$/i, "."))}</a><ul class="navlinks">${nav}</ul></div></nav>
${renderHero(hero)}
${sections.map(renderSection).join("\n")}
<footer><div class="wrap"><div>Designed & coded by Lola Tseng.</div><div class="stack">Edit content in content.md. Generated by scripts/build.js.</div></div></footer>
${isServe ? `<script>
const events = new EventSource("/__reload");
events.onmessage = () => location.reload();
</script>` : ""}
</body>
</html>
`;
}

function build() {
  const markdown = fs.readFileSync(sourcePath, "utf8");
  fs.writeFileSync(outputPath, renderPage(markdown), "utf8");
  console.log(`[build] ${path.relative(root, sourcePath)} -> ${path.relative(root, outputPath)} ${new Date().toLocaleTimeString()}`);
}

let clients = [];

function notifyReload() {
  clients.forEach((response) => response.write("data: reload\n\n"));
}

function startServer() {
  const server = http.createServer((request, response) => {
    if (request.url === "/__reload") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      clients.push(response);
      request.on("close", () => {
        clients = clients.filter((client) => client !== response);
      });
      return;
    }

    const requested = request.url === "/" ? "index.html" : decodeURIComponent(request.url.split("?")[0].slice(1));
    const filePath = path.resolve(root, requested);
    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      const ext = path.extname(filePath);
      const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
      response.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
      response.end(data);
    });
  });

  server.listen(port, () => {
    console.log(`[serve] http://localhost:${port}`);
  });
}

build();

if (isWatch) {
  let timer;
  fs.watch(sourcePath, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        build();
        notifyReload();
      } catch (error) {
        console.error(error);
      }
    }, 120);
  });
  console.log("[watch] content.md");
}

if (isServe) startServer();
