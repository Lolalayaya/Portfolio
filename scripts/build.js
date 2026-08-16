const fs = require("fs");
const path = require("path");
const http = require("http");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "content.md");
const outputPath = path.join(root, "index.html");
const enSourcePath = path.join(root, "content.en.md");
const enOutputPath = path.join(root, "index-en.html");
const projectsDir = path.join(root, "projects");
const enProjectsDir = path.join(root, "projects-en");
const enJournalDir = path.join(root, "journal-en");
const caseStudiesDir = path.join(root, "case-studies");
const journalDir = path.join(root, "journal");
const articlesDir = path.join(root, "articles");
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

let currentImageBaseDir = root;

function readImageSize(absPath) {
  let buffer;
  try {
    buffer = fs.readFileSync(absPath);
  } catch (error) {
    return null;
  }

  if (buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      const isSofMarker = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (isSofMarker) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + segmentLength;
    }
  }

  return null;
}

function resolveImageDims(src) {
  if (/^https?:\/\//i.test(src)) return null;
  try {
    const absPath = path.resolve(currentImageBaseDir, decodeURIComponent(src));
    return readImageSize(absPath);
  } catch (error) {
    return null;
  }
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
    const dims = resolveImageDims(src);
    const dimAttrs = dims ? ` width="${dims.width}" height="${dims.height}"` : "";
    return stash(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${titleAttr}${dimAttrs}>`);
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const externalAttrs = /^https?:\/\//i.test(href) ? ` target="_blank" rel="noopener noreferrer"` : "";
    return stash(`<a href="${escapeHtml(href)}"${externalAttrs}>${inline(label)}</a>`);
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

// Text-to-diagram timeline: an ordered list where every item reads
// "**[KIND] Title** — description" (KIND: SYS/INPUT/ENGINE/OUTPUT) renders
// as connected step cards instead of a plain <ol>. Add branches on an
// ENGINE step with ｜Label=>Text｜Label=>Text after the description.
function parseTimelineStep(raw) {
  const match = raw.match(/^\*\*\[(SYS|INPUT|ENGINE|OUTPUT)\]\s*([^*]+)\*\*\s*[-–—]\s*(.+)$/);
  if (!match) return null;
  const [, kind, title, rest] = match;
  const parts = rest.split("｜");
  const description = parts.shift().trim();
  const branches = parts
    .map((part) => {
      const branchMatch = part.trim().match(/^(.+?)=>(.+)$/);
      return branchMatch ? { label: branchMatch[1].trim(), text: branchMatch[2].trim() } : null;
    })
    .filter(Boolean);
  return { kind: kind.toLowerCase(), title: title.trim(), description, branches };
}

function renderTimeline(steps) {
  const stepsHtml = steps
    .map((step, index) => {
      const num = String(index + 1).padStart(2, "0");
      const numClass = step.kind === "engine" ? "dt-num decision" : "dt-num";
      const branchHtml = step.branches.length
        ? `<div class="dt-branch-grid">${step.branches
            .map((branch) => `<div class="dt-branch-card"><span>${inline(branch.label)}</span><p>${inline(branch.text)}</p></div>`)
            .join("")}</div>`
        : "";
      return `<div class="dt-step"><div class="dt-rail"><div class="${numClass}">${num}</div></div><div class="dt-body"><span class="dt-kind ${step.kind}">${step.kind}</span><h4>${inline(step.title)}</h4><p>${inline(step.description)}</p>${branchHtml}</div></div>`;
    })
    .join("");
  return `<div class="dt-timeline">${stepsHtml}</div>`;
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
    if (block.ordered) {
      const steps = block.items.map(parseTimelineStep);
      if (steps.length && steps.every(Boolean)) return renderTimeline(steps);
    }
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

function isTagLine(block) {
  return block.type === "paragraph" && /^#\S+(\s+#\S+)*$/.test(block.text.trim());
}

function renderCardSection(section, kind) {
  const cards = collectCards(section);
  const tag = section.blocks.find((block) => block.type === "quote");
  const gridClass = kind === "projects" ? "proj-grid" : kind === "playground" ? "pg-grid" : kind === "ai" ? "ai-grid" : "journal-list";
  const cardHtml = cards.map((card, index) => {
    const text = card.blocks.find((block) => block.type === "paragraph" && !block.text.startsWith("![") && !isTagLine(block));
    const image = card.blocks.find((block) => block.type === "paragraph" && block.text.startsWith("!["));
    const tagsBlock = card.blocks.find(isTagLine);
    const tagsHtml = tagsBlock ? `<div class="proj-tags">${tagsBlock.text.trim().split(/\s+/).map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}</div>` : "";
    if (kind === "ai") return `<article class="ai-card"><div class="ai-num">${String(index + 1).padStart(2, "0")}</div><h3>${inline(card.title)}</h3>${text ? renderBlock(text) : ""}</article>`;
    if (kind === "projects") {
      const href = projectHrefForTitle(card.title, index);
      const body = `<div class="proj-thumb">${image ? inline(image.text) : "Project image"}</div><div class="proj-body"><h3>${inline(card.title)}</h3>${text ? renderBlock(text) : ""}${tagsHtml}</div>`;
      return `<article class="proj-card">${href ? `<a class="proj-link" href="${href}">${body}</a>` : body}</article>`;
    }
    if (kind === "journal") {
      const href = journalHrefForTitle(card.title, index);
      const titleHtml = href ? `<a href="${href}">${inline(card.title)}</a>` : inline(card.title);
      return `<article class="journal-item"><h3>${titleHtml}</h3><span>${text ? inline(text.text) : ""}</span></article>`;
    }
    return `<article class="pg-card"><h3>${inline(card.title)}</h3>${text ? renderBlock(text) : ""}</article>`;
  }).join("");
  return `<section id="${section.id}" class="${section.className}"><div class="wrap">${tag ? renderBlock(tag) : ""}<h2>${inline(section.text)}</h2><div class="${gridClass}">${cardHtml}</div></div></section>`;
}

function renderProcess(section) {
  const tag = section.blocks.find((block) => block.type === "quote");
  const steps = section.blocks.find((block) => block.type === "list" && block.ordered);
  const items = steps ? steps.items : [];
  const flow = items.map((item, index) => {
    const step = `<span class="flow-step">${inline(item)}</span>`;
    return index < items.length - 1 ? `${step}<span class="flow-arrow">→</span>` : step;
  }).join("");
  return `<section id="${section.id}" class="${section.className}"><div class="wrap">${tag ? renderBlock(tag) : ""}<h2>${inline(section.text)}</h2><div class="process-flow">${flow}</div></div></section>`;
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
  if (section.className === "projects") return renderCardSection(section, "projects");
  if (section.className === "ai-journey") return renderCardSection(section, "ai");
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
  const lang = meta.lang || "zh-Hant";
  const homeHref = meta.homeHref || "../index.html#work";
  const langSwitch = meta.altHref ? `<a class="lang-switch" href="${escapeHtml(meta.altHref)}">${escapeHtml(meta.altLabel || "")}</a>` : "";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script>(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>
<title>${escapeHtml(pageTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles/site.css">
<link rel="icon" type="image/png" href="../images/favicon-32.png">
<link rel="apple-touch-icon" href="../images/apple-touch-icon.png">
</head>
<body>
<nav><div class="wrap"><a class="brand" href="${homeHref}"><img class="brand-mark" src="../images/logo-mark.png" alt="">Lola Tseng.</a><ul class="navlinks">${nav}</ul><div class="nav-controls"><button type="button" class="theme-switch" aria-label="切換深色模式"></button>${langSwitch}</div></div></nav>
<main>
<header class="hero"><div class="wrap">${tag ? `<span class="eyebrow">${inline(tag.text.replace(/^Project Type:\s*/i, ""))}</span>` : ""}<h1>${inline(hero.title)}</h1>${summary ? `<p class="summary">${inline(summary.text)}</p>` : ""}<div class="cover">${image ? inline(image.text) : "Project Cover Image"}</div></div></header>
${snapshot ? `<section id="${snapshot.id}" class="snapshot"><div class="wrap"><h2>${inline(snapshot.text)}</h2>${snapshot.blocks.map(renderBlock).join("")}</div></section>` : ""}
${bodySections.map(renderProjectSection).join("\n")}
<section><div class="wrap"><div class="back-row">${meta.previous ? `<a class="btn-outline" href="${meta.previous}.html">Previous Project</a>` : `<span></span>`}<a class="btn-outline" href="${homeHref}">Back to Work</a>${meta.next ? `<a class="btn-outline" href="${meta.next}.html">Next Project</a>` : `<span></span>`}</div></div></section>
</main>
<footer><div class="wrap">Designed & coded by Lola Tseng.</div></footer>
<script src="../scripts/reveal.js"></script>
<script src="../scripts/cursor-fx.js"></script>
<script src="../scripts/theme.js"></script>
${isServe ? `<script src="../scripts/live-reload.js"></script>` : ""}
</body>
</html>
`;
}

let projectPages = [];
let enProjectPages = [];

function readProjectPages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".md") && !file.startsWith("_"))
    .sort()
    .map((file) => {
      const markdown = fs.readFileSync(path.join(dir, file), "utf8");
      const { hero } = splitDocument(parseBlocks(markdown));
      const slug = path.basename(file, ".md");
      return { file, slug, title: hero.title, markdown };
    });
}

let currentLangSuffix = "";

function projectHrefForTitle(title, index) {
  const normalized = title.trim().toLowerCase();
  const match = projectPages.find((project) => project.title.trim().toLowerCase() === normalized);
  const project = match || projectPages[index];
  if (!project) return "";
  const hasEn = enProjectPages.some((entry) => entry.slug === project.slug);
  const suffix = currentLangSuffix === ".en" && hasEn ? ".en" : "";
  return `case-studies/${project.slug}${suffix}.html`;
}

function renderJournalSection(section) {
  const body = section.blocks.map(renderBlock).join("");
  return `<section><div class="wrap article-body"><h2>${inline(section.text)}</h2>${body}</div></section>`;
}

function renderJournalPage(markdown, meta = {}) {
  const { hero, sections } = splitDocument(parseBlocks(markdown));
  const tag = hero.blocks.find((block) => block.type === "quote");
  const summary = firstProjectParagraph(hero.blocks);
  const pageTitle = `${hero.title} | Lola Tseng`;
  const lang = meta.lang || "zh-Hant";
  const homeHref = meta.homeHref || "../index.html#journal";
  const backLabel = meta.backLabel || "Back to Journal";
  const langSwitch = meta.altHref ? `<a class="lang-switch" href="${escapeHtml(meta.altHref)}">${escapeHtml(meta.altLabel || "")}</a>` : "";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script>(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>
<title>${escapeHtml(pageTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles/site.css">
<link rel="icon" type="image/png" href="../images/favicon-32.png">
<link rel="apple-touch-icon" href="../images/apple-touch-icon.png">
</head>
<body>
<nav><div class="wrap"><a class="brand" href="${homeHref}"><img class="brand-mark" src="../images/logo-mark.png" alt="">Lola Tseng.</a><ul class="navlinks"><li><a href="${homeHref}">${escapeHtml(backLabel)}</a></li></ul><div class="nav-controls"><button type="button" class="theme-switch" aria-label="切換深色模式"></button>${langSwitch}</div></div></nav>
<main>
<header class="hero"><div class="wrap">${tag ? `<span class="eyebrow">${inline(tag.text)}</span>` : ""}<h1>${inline(hero.title)}</h1>${summary ? `<p class="summary">${inline(summary.text)}</p>` : ""}</div></header>
${sections.map(renderJournalSection).join("\n")}
<section><div class="wrap"><div class="back-row"><a class="btn-outline" href="${homeHref}">${escapeHtml(backLabel)}</a></div></div></section>
</main>
<footer><div class="wrap">Designed & coded by Lola Tseng.</div></footer>
<script src="../scripts/reveal.js"></script>
<script src="../scripts/cursor-fx.js"></script>
<script src="../scripts/theme.js"></script>
${isServe ? `<script src="../scripts/live-reload.js"></script>` : ""}
</body>
</html>
`;
}

let journalPages = [];
let enJournalPages = [];

function readJournalPages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".md") && !file.startsWith("_"))
    .sort()
    .map((file) => {
      const markdown = fs.readFileSync(path.join(dir, file), "utf8");
      const { hero } = splitDocument(parseBlocks(markdown));
      const slug = path.basename(file, ".md");
      return { file, slug, title: hero.title, markdown };
    });
}

function journalHrefForTitle(title, index) {
  const normalized = title.trim().toLowerCase();
  const match = journalPages.find((entry) => entry.title.trim().toLowerCase() === normalized);
  const entry = match || journalPages[index];
  if (!entry) return "";
  const hasEn = enJournalPages.some((item) => item.slug === entry.slug);
  const suffix = currentLangSuffix === ".en" && hasEn ? ".en" : "";
  return `articles/${entry.slug}${suffix}.html`;
}

function renderPage(markdown, opts = {}) {
  const { hero, sections } = splitDocument(parseBlocks(markdown));
  const nav = sections.map((section) => `<li><a href="#${section.id}">${escapeHtml(section.text)}</a></li>`).join("");
  const lang = opts.lang || "zh-Hant";
  const langSwitch = opts.altHref ? `<a class="lang-switch" href="${escapeHtml(opts.altHref)}">${escapeHtml(opts.altLabel || "")}</a>` : "";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script>(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>
<title>${escapeHtml(hero.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles/site.css">
<link rel="icon" type="image/png" href="images/favicon-32.png">
<link rel="apple-touch-icon" href="images/apple-touch-icon.png">
</head>
<body>
<nav><div class="wrap"><a class="brand" href="#home"><img class="brand-mark" src="images/logo-mark.png" alt="">${escapeHtml(hero.title.replace(/\s+Portfolio$/i, "."))}</a><ul class="navlinks">${nav}</ul><div class="nav-controls"><button type="button" class="theme-switch" aria-label="切換深色模式"></button>${langSwitch}</div></div></nav>
${renderHero(hero)}
${sections.map(renderSection).join("\n")}
<footer><div class="wrap"><div>Designed & coded by Lola Tseng.</div><div class="stack">Edit content in content.md. Generated by scripts/build.js.</div></div></footer>
<script src="scripts/reveal.js"></script>
<script src="scripts/cursor-fx.js"></script>
<script src="scripts/theme.js"></script>
${isServe ? `<script src="scripts/live-reload.js"></script>` : ""}
</body>
</html>
`;
}

function build() {
  fs.mkdirSync(caseStudiesDir, { recursive: true });
  projectPages = readProjectPages(projectsDir);
  enProjectPages = readProjectPages(enProjectsDir);
  currentImageBaseDir = caseStudiesDir;
  projectPages.forEach((project, index) => {
    const previous = projectPages[index - 1]?.slug || "";
    const next = projectPages[index + 1]?.slug || "";
    const hasEn = enProjectPages.some((entry) => entry.slug === project.slug);
    fs.writeFileSync(path.join(caseStudiesDir, `${project.slug}.html`), renderProjectPage(project.markdown, {
      previous,
      next,
      lang: "zh-Hant",
      homeHref: "../index.html#work",
      altHref: hasEn ? `${project.slug}.en.html` : "",
      altLabel: "EN",
    }), "utf8");
    console.log(`[build] ${path.join("projects", project.file)} -> ${path.join("case-studies", `${project.slug}.html`)}`);
  });
  enProjectPages.forEach((project, index) => {
    const previous = enProjectPages[index - 1]?.slug || "";
    const next = enProjectPages[index + 1]?.slug || "";
    fs.writeFileSync(path.join(caseStudiesDir, `${project.slug}.en.html`), renderProjectPage(project.markdown, {
      previous: previous ? `${previous}.en` : "",
      next: next ? `${next}.en` : "",
      lang: "en",
      homeHref: "../index-en.html#work",
      altHref: `${project.slug}.html`,
      altLabel: "中文",
    }), "utf8");
    console.log(`[build] ${path.join("projects-en", project.file)} -> ${path.join("case-studies", `${project.slug}.en.html`)}`);
  });
  fs.mkdirSync(articlesDir, { recursive: true });
  journalPages = readJournalPages(journalDir);
  enJournalPages = readJournalPages(enJournalDir);
  currentImageBaseDir = articlesDir;
  journalPages.forEach((entry) => {
    const hasEn = enJournalPages.some((item) => item.slug === entry.slug);
    fs.writeFileSync(path.join(articlesDir, `${entry.slug}.html`), renderJournalPage(entry.markdown, {
      lang: "zh-Hant",
      homeHref: "../index.html#journal",
      backLabel: "Back to Journal",
      altHref: hasEn ? `${entry.slug}.en.html` : "",
      altLabel: "EN",
    }), "utf8");
    console.log(`[build] ${path.join("journal", entry.file)} -> ${path.join("articles", `${entry.slug}.html`)}`);
  });
  enJournalPages.forEach((entry) => {
    fs.writeFileSync(path.join(articlesDir, `${entry.slug}.en.html`), renderJournalPage(entry.markdown, {
      lang: "en",
      homeHref: "../index-en.html#journal",
      backLabel: "Back to Journal",
      altHref: `${entry.slug}.html`,
      altLabel: "中文",
    }), "utf8");
    console.log(`[build] ${path.join("journal-en", entry.file)} -> ${path.join("articles", `${entry.slug}.en.html`)}`);
  });
  currentImageBaseDir = root;
  const markdown = fs.readFileSync(sourcePath, "utf8");
  const hasEn = fs.existsSync(enSourcePath);
  currentLangSuffix = "";
  fs.writeFileSync(outputPath, renderPage(markdown, hasEn ? { altHref: "index-en.html", altLabel: "EN" } : {}), "utf8");
  console.log(`[build] ${path.relative(root, sourcePath)} -> ${path.relative(root, outputPath)} ${new Date().toLocaleTimeString()}`);

  if (hasEn) {
    const enMarkdown = fs.readFileSync(enSourcePath, "utf8");
    currentLangSuffix = ".en";
    fs.writeFileSync(enOutputPath, renderPage(enMarkdown, { lang: "en", altHref: "index.html", altLabel: "中文" }), "utf8");
    currentLangSuffix = "";
    console.log(`[build] ${path.relative(root, enSourcePath)} -> ${path.relative(root, enOutputPath)} ${new Date().toLocaleTimeString()}`);
  }
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
  if (fs.existsSync(enSourcePath)) watchPath(enSourcePath, "content.en.md");
  if (fs.existsSync(projectsDir)) watchPath(projectsDir, "projects/*.md");
  if (fs.existsSync(enProjectsDir)) watchPath(enProjectsDir, "projects-en/*.md");
  if (fs.existsSync(journalDir)) watchPath(journalDir, "journal/*.md");
  if (fs.existsSync(enJournalDir)) watchPath(enJournalDir, "journal-en/*.md");
}

if (isServe) startServer();
