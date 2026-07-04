# Markdown Webpage Rules

Use these rules when creating `content.md` for a generated webpage.

## Required Document Shape

Start every file with exactly one `#`. This becomes the page title and hero headline.

```markdown
# Page Title
```

Use a short blockquote after the title for the hero label or page note.

```markdown
> Practical guide
```

Use one or two paragraphs for the hero summary. Add CTA links as a Markdown list.

```markdown
This page explains the topic in plain language.

- [Start reading](#overview)
- [Contact](#contact)
```

Separate major page sections with `---`.

```markdown
---
```

Use `##` for major sections. Add `{#id .class}` when the section needs a stable anchor or layout hint.

```markdown
## Overview {#overview .section}
```

Use `###` for subsection cards, entries, or grouped ideas.

```markdown
### First Principle

Explanation text.
```

Use `####` only for small labels inside a subsection.

## Supported Content Patterns

### Bullet Lists

Use bullets for unordered points, features, requirements, or takeaways.

```markdown
- Clear navigation
- Fast content updates
- Reusable page structure
```

### Ordered Steps

Use numbered lists for procedures. For process pages, prefer bold step names followed by a dash.

```markdown
1. **Research** - Gather facts and examples.
2. **Draft** - Write the Markdown structure.
3. **Generate** - Build the HTML.
```

### Images

Use standard Markdown image syntax.

```markdown
![Meaningful alt text](images/example.jpg "Optional title")
```

Rules:

- Always write meaningful alt text.
- Prefer local `images/` assets when the user provides images.
- Use external image URLs only when licensing and stability are acceptable.
- Do not leave vague placeholders such as `image here` in final output.

### Tables

Use tables for comparisons, schedules, specs, pricing, pros/cons, or grouped facts.

```markdown
| Item | Use | Notes |
| --- | --- | --- |
| Markdown | Source content | Easy to edit |
| HTML | Generated output | Browser-ready |
```

### Notes and Callouts

Use blockquotes for notes, caveats, definitions, or highlighted context.

```markdown
> Note: Validate current facts before publishing.
```

### Links

Use normal Markdown links.

```markdown
[OpenAI](https://openai.com/)
```

For internal navigation, link to section IDs.

```markdown
[See examples](#examples)
```

## Recommended Page Sections

Choose sections based on the topic. Common structures:

### Informational Topic Page

```markdown
## Overview {#overview .section}
## Key Ideas {#key-ideas .cards}
## Step-by-Step Guide {#guide .process}
## Examples {#examples .cards}
## FAQ {#faq .section}
```

### Portfolio or Personal Page

```markdown
## About {#about .about}
## Work {#work .cards}
## Process {#process .process}
## Journal {#journal .list}
## Contact {#contact .contact}
```

### Product or Service Page

```markdown
## Problem {#problem .section}
## Solution {#solution .cards}
## Features {#features .cards}
## Comparison {#comparison .table}
## Getting Started {#start .process}
## Contact {#contact .contact}
```

### Event Page

```markdown
## Details {#details .section}
## Schedule {#schedule .table}
## Speakers {#speakers .cards}
## Venue {#venue .section}
## Registration {#registration .contact}
```

## Quality Checklist

Before generating HTML:

- The document has one `#` title.
- Every major section uses `##`.
- Sections are separated by `---`.
- Each section has a clear purpose.
- Lists, steps, tables, images, and notes are used where they improve scanning.
- No raw HTML is needed.
- No TODO placeholders remain unless the user explicitly requested placeholders.
- Current or factual claims have been researched and are phrased carefully.
