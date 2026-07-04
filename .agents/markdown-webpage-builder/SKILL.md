---
name: markdown-webpage-builder
description: Create Markdown-driven static webpages from early user ideas. Use when the user provides an initial website, landing page, portfolio, article page, event page, product page, or topic concept and wants Codex to research the topic, design structured Markdown content, and generate matching HTML in a new English-named topic folder.
---

# Markdown Webpage Builder

Use this skill to turn an early webpage idea into a topic-specific folder containing Markdown source and generated HTML.

## Workflow

1. Clarify the requested topic from the user prompt. If the topic is ambiguous but still usable, make a conservative assumption and state it.
2. Research the topic deeply before writing content. Use web browsing when the topic is current, factual, niche, product-specific, location-specific, or recommendation-like. Prefer primary or official sources when available.
3. Create a new English, lowercase, hyphen-case folder for each topic under the user's requested output location, or under the current workspace if no output location is given.
4. Read `references/markdown-rules.md` before drafting the Markdown.
5. Write `content.md` using the required Markdown structure and section rules.
6. Run `scripts/generate_markdown_site.js` to generate `index.html` from `content.md`.
7. Verify that the generated HTML exists and that headings, links, images, tables, lists, notes, and section IDs render from Markdown as intended.

## Folder Contract

Each topic must use this structure:

```text
topic-name/
  content.md
  index.html
```

Optional assets may be added when needed:

```text
topic-name/
  images/
  content.md
  index.html
```

Do not overwrite an existing topic folder unless the user explicitly asks to update that topic. If a folder name already exists, append a short suffix such as `-2` or a more specific topic qualifier.

## Script Usage

From the skill folder, run:

```bash
node scripts/generate_markdown_site.js --input path/to/topic/content.md --output path/to/topic/index.html
```

Optional:

```bash
node scripts/generate_markdown_site.js --input path/to/topic/content.md --output path/to/topic/index.html --title "Page Title"
```

The script intentionally supports common Markdown only. Keep custom behavior in the Markdown structure, not in ad hoc HTML.

## Output Expectations

The generated page should be a usable first draft, not a placeholder. Include:

- Clear hierarchy with one `#`, multiple `##`, and useful `###` subsections.
- Lists for key points, steps, benefits, requirements, or comparisons.
- Tables when comparison or structured facts help scanning.
- Images with Markdown image syntax when visual context matters; use real available assets or stable external image URLs only when appropriate.
- Notes or callouts using blockquotes.
- Section IDs in heading attributes for navigation, such as `## Process {#process .section}`.

Keep the Markdown source readable for a non-technical user. Avoid embedding raw HTML unless the user specifically needs custom markup.
