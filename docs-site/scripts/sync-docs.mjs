#!/usr/bin/env -S deno run -A
/**
 * sync-docs.mjs — pull canonical docs from ../docs into the Starlight site.
 *
 * Source of truth stays in the repo's /docs folder (ADRs + CONTEXT.md +
 * cryptography-glossary.md). This script renders them into the docs site at
 * build time, so a single PR that edits an ADR also updates the published page.
 *
 * Output dirs are git-ignored (see .gitignore) — never hand-edit them.
 *
 * Runs under Deno (node: built-ins are supported).
 */
import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const docsDir = join(repoRoot, "docs");
const adrSrcDir = join(docsDir, "adr");
const referenceOutDir = join(here, "..", "src", "content", "docs", "reference");
const outAdrDir = join(referenceOutDir, "adr");

// Canonical glossary lives at the repo root.
const contextSrc = join(repoRoot, "CONTEXT.md");
const outGeneratedDir = join(referenceOutDir, "_generated");

/** Turn "012-session-tokens.md" → "Session tokens". */
function titleFromAdrFilename(filename) {
  const stem = basename(filename, ".md").replace(/^\d+-/, "");
  return stem.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Pull the ADR number for ordering ("012-..." → 12). */
function adrNumber(filename) {
  const m = filename.match(/^(\d+)-/);
  return m ? Number(m[1]) : 9999;
}

/** Strip a leading "# Heading" so Starlight's frontmatter title owns the H1. */
function stripLeadingH1(body) {
  return body.replace(/^\s*#\s+.*\n+/, "");
}

function yamlEscape(s) {
  return s.replace(/"/g, '\\"');
}

async function syncAdrs() {
  if (!existsSync(adrSrcDir)) {
    console.warn(`[sync-docs] no ADR dir at ${adrSrcDir} — skipping`);
    return 0;
  }
  await rm(outAdrDir, { recursive: true, force: true });
  await mkdir(outAdrDir, { recursive: true });

  const files = (await readdir(adrSrcDir))
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => adrNumber(a) - adrNumber(b));

  for (const file of files) {
    const raw = await readFile(join(adrSrcDir, file), "utf8");
    const num = adrNumber(file);
    const title = titleFromAdrFilename(file);
    const frontmatter = [
      "---",
      `title: "ADR ${String(num).padStart(3, "0")}: ${yamlEscape(title)}"`,
      `description: "Architectural decision record ${num} — ${yamlEscape(title)}."`,
      "editUrl: false",
      "sidebar:",
      `  order: ${num}`,
      `  label: "${String(num).padStart(3, "0")} · ${yamlEscape(title)}"`,
      "---",
      "",
      ":::note[Source of truth]",
      `This page is generated from \`docs/adr/${file}\` in the code repo. Edit it there, not here.`,
      ":::",
      "",
    ].join("\n");
    // Plain .md (not .mdx): ADRs contain inline <...> tokens that MDX would
    // try to parse as JSX. Markdown treats them literally.
    const out = frontmatter + stripLeadingH1(raw);
    await writeFile(join(outAdrDir, file), out, "utf8");
  }

  // Section landing page for the generated ADR list.
  const indexFm = [
    "---",
    'title: "Architecture Decision Records"',
    'description: "The full set of ADRs governing Yawp\'s design, generated from the code repo."',
    "editUrl: false",
    "sidebar:",
    "  order: 0",
    '  label: "ADR index"',
    "---",
    "",
    "These records are generated from `docs/adr/` in the code repository and are the",
    "authoritative rationale behind Yawp's design. Each concept page under",
    "**How Yawp works** links down to the relevant ADR here.",
    "",
  ].join("\n");
  await writeFile(join(outAdrDir, "index.mdx"), indexFm, "utf8");

  console.log(`[sync-docs] synced ${files.length} ADRs → reference/adr/`);
  return files.length;
}

async function syncGlossary() {
  if (!existsSync(contextSrc)) {
    console.warn(`[sync-docs] no CONTEXT.md at ${contextSrc} — skipping glossary`);
    return;
  }
  await mkdir(outGeneratedDir, { recursive: true });
  const raw = await readFile(contextSrc, "utf8");
  const frontmatter = [
    "---",
    'title: "Glossary"',
    'description: "Canonical product and federation vocabulary for Yawp, generated from CONTEXT.md."',
    "slug: reference/glossary",
    "editUrl: false",
    "tableOfContents:",
    "  maxHeadingLevel: 2",
    "sidebar:",
    "  order: 1",
    "---",
    "",
    ":::note[Source of truth]",
    "This page is generated from `CONTEXT.md` in the code repo. When a term here disagrees with a term elsewhere, this file wins. Edit it there.",
    ":::",
    "",
  ].join("\n");
  await writeFile(
    join(outGeneratedDir, "glossary.md"),
    frontmatter + stripLeadingH1(raw),
    "utf8",
  );
  console.log("[sync-docs] synced glossary ← CONTEXT.md");
}

await syncAdrs();
await syncGlossary();
console.log("[sync-docs] done");
