const fs = require("fs");
const path = require("path");
const http = require("http");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "content.md");
const outputPath = path.join(root, "index.html");
const projectsDir = path.join(root, "projects");
const caseStudiesDir = path.join(root, "case-studies");
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
  const tokens = [];
  const stash = (html) => {
    tokens.push(html);
    return `\u0000${tokens.length - 1}\u0000`;
  };

  let html = String(value);
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_, alt, src, title) => {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return stash(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${titleAttr}>`);
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    return stash(`<a href="${escapeHtml(href)}">${inline(label)}</a>`);
  });
  html = escapeHtml(html);
  html = html.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] || "");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  return html;
}

function parseBlocks(markdown) {
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, "");
  const lines = withoutComments.replace(/\r\n/g, "\n").split("\n");
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
    if (kind === "projects") {
      const href = projectHrefForTitle(card.title, index);
      const body = `<div class="proj-thumb">${image ? inline(image.text) : "Project image"}</div><div class="proj-body"><h3>${inline(card.title)}</h3>${text ? renderBlock(text) : ""}</div>`;
      return `<article class="proj-card">${href ? `<a class="proj-link" href="${href}">${body}</a>` : body}</article>`;
    }
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

function firstProjectParagraph(blocks) {
  return blocks.find((block) => block.type === "paragraph" && !block.text.startsWith("!["));
}

function firstProjectImage(blocks) {
  return blocks.find((block) => block.type === "paragraph" && block.text.startsWith("!["));
}

function renderProjectSection(section, index) {
  const body = section.blocks.map(renderBlock).join("");
  const isProcess = section.text.toLowerCase().includes("process");
  const classes = isProcess ? "highlight" : "";
  return `<section id="${section.id}" class="${classes}"><div class="wrap two-col"><div class="section-note"><span class="eyebrow">${String(index + 1).padStart(2, "0")}</span><h2>${inline(section.text)}</h2></div><div class="section-body">${body}</div></div></section>`;
}

function renderProjectPage(markdown, meta = {}) {
  const { hero, sections } = splitDocument(parseBlocks(markdown));
  const tag = hero.blocks.find((block) => block.type === "quote");
  const summary = firstProjectParagraph(hero.blocks);
  const image = firstProjectImage(hero.blocks);
  const snapshot = sections.find((section) => section.text.toLowerCase() === "project snapshot");
  const bodySections = sections.filter((section) => section !== snapshot);
  const nav = bodySections.map((section) => `<li><a href="#${section.id}">${escapeHtml(section.text)}</a></li>`).join("");
  const pageTitle = `${hero.title} | Lola Tseng`;

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(pageTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles/site.css">
</head>
<body>
<nav><div class="wrap"><a class="brand" href="../index.html#work">Lola Tseng.</a><ul class="navlinks">${nav}</ul></div></nav>
<main>
<header class="hero"><div class="wrap">${tag ? `<span class="eyebrow">${inline(tag.text.replace(/^Project Type:\s*/i, ""))}</span>` : ""}<h1>${inline(hero.title)}</h1>${summary ? `<p class="summary">${inline(summary.text)}</p>` : ""}<div class="cover">${image ? inline(image.text) : "Project Cover Image"}</div></div></header>
${snapshot ? `<section id="${snapshot.id}" class="snapshot"><div class="wrap"><h2>${inline(snapshot.text)}</h2>${snapshot.blocks.map(renderBlock).join("")}</div></section>` : ""}
${bodySections.map(renderProjectSection).join("\n")}
<section><div class="wrap"><div class="back-row">${meta.previous ? `<a class="btn-outline" href="${meta.previous}.html">Previous Project</a>` : `<span></span>`}<a class="btn-outline" href="../index.html#work">Back to Work</a>${meta.next ? `<a class="btn-outline" href="${meta.next}.html">Next Project</a>` : `<span></span>`}</div></div></section>
</main>
<footer><div class="wrap">Designed & coded by Lola Tseng.</div></footer>
${isServe ? `<script src="../scripts/live-reload.js"></script>` : ""}
</body>
</html>
`;
}

let projectPages = [];

function readProjectPages() {
  if (!fs.existsSync(projectsDir)) return [];
  return fs.readdirSync(projectsDir)
    .filter((file) => file.endsWith(".md") && !file.startsWith("_"))
    .sort()
    .map((file) => {
      const markdown = fs.readFileSync(path.join(projectsDir, file), "utf8");
      const { hero } = splitDocument(parseBlocks(markdown));
      const slug = path.basename(file, ".md");
      return { file, slug, title: hero.title, markdown };
    });
}

function projectHrefForTitle(title, index) {
  const normalized = title.trim().toLowerCase();
  const match = projectPages.find((project) => project.title.trim().toLowerCase() === normalized);
  const project = match || projectPages[index];
  return project ? `case-studies/${project.slug}.html` : "";
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
<link rel="stylesheet" href="styles/site.css">
</head>
<body>
<nav><div class="wrap"><a class="brand" href="#home">${escapeHtml(hero.title.replace(/\s+Portfolio$/i, "."))}</a><ul class="navlinks">${nav}</ul></div></nav>
${renderHero(hero)}
${sections.map(renderSection).join("\n")}
<footer><div class="wrap"><div>Designed & coded by Lola Tseng.</div><div class="stack">Edit content in content.md. Generated by scripts/build.js.</div></div></footer>
${isServe ? `<script src="scripts/live-reload.js"></script>` : ""}
</body>
</html>
`;
}

function build() {
  fs.mkdirSync(caseStudiesDir, { recursive: true });
  projectPages = readProjectPages();
  projectPages.forEach((project, index) => {
    const previous = projectPages[index - 1]?.slug || "";
    const next = projectPages[index + 1]?.slug || "";
    fs.writeFileSync(path.join(caseStudiesDir, `${project.slug}.html`), renderProjectPage(project.markdown, { previous, next }), "utf8");
    console.log(`[build] ${path.join("projects", project.file)} -> ${path.join("case-studies", `${project.slug}.html`)}`);
  });
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

function watchPath(target, label) {
  let timer;
  fs.watch(target, () => {
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
  console.log(`[watch] ${label}`);
}

if (isWatch) {
  watchPath(sourcePath, "content.md");
  if (fs.existsSync(projectsDir)) watchPath(projectsDir, "projects/*.md");
}

if (isServe) startServer();
