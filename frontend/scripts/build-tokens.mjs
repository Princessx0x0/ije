// Compiles src/styles/tokens.json (the single source, also published as the
// Ije design system) into src/styles/tokens.css.
//
// Run: npm run tokens   (also runs before `next build` and `next dev`)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../src/styles/tokens.json");
const out = join(here, "../src/styles/tokens.css");
const t = JSON.parse(readFileSync(src, "utf8"));

const [light, ...others] = t.color.themes.map((th) => th.id);
const themed = [...t.color.tokens, ...(t.shadow?.tokens ?? [])];
const valueFor = (tok, theme) => (typeof tok.value === "string" ? tok.value : tok.value[theme] ?? tok.value[light]);
const decls = (theme) => themed.map((tok) => `  --${tok.name}: ${valueFor(tok, theme)};`).join("\n");

// The self-hosted Fontsource faces are named by these variables (globals.css);
// the stack after each is the tokens.json fallback.
const fontVar = { display: "--font-newsreader", text: "--font-atkinson" };
const families = Object.entries(t.type.families)
  .map(([key, stack]) => {
    const fallback = stack.split(",").slice(1).join(",").trim();
    return `  --font-${key}: var(${fontVar[key]}), ${fallback};`;
  })
  .join("\n");

const scalars = [...t.spacing.tokens, ...t.radius.tokens].map((tok) => `  --${tok.name}: ${tok.value};`).join("\n");

const styles = t.type.groups
  .flatMap((g) =>
    g.styles.map((s) => {
      const lines = [
        `  font-family: var(--font-${s.family ?? g.family});`,
        `  font-size: ${s.fontSize};`,
        `  line-height: ${s.lineHeight};`,
        `  font-weight: ${s.fontWeight};`,
      ];
      if (s.letterSpacing) lines.push(`  letter-spacing: ${s.letterSpacing};`);
      if (s.opticalSize) lines.push(`  font-variation-settings: "opsz" ${s.opticalSize};`);
      if (s.name === "overline") lines.push(`  text-transform: uppercase;`);
      return `.ije-type-${s.name} {\n${lines.join("\n")}\n}`;
    }),
  )
  .join("\n\n");

const darkBlocks = others
  .map(
    (theme) => `[data-theme="${theme}"] {\n${decls(theme)}\n  color-scheme: ${theme};\n}\n\n@media (prefers-color-scheme: ${theme}) {\n  :root:not([data-theme="${light}"]) {\n${decls(theme).replace(/^/gm, "  ")}\n    color-scheme: ${theme};\n  }\n}`,
  )
  .join("\n\n");

const css = `/* ${t.name} tokens: generated from tokens.json by scripts/build-tokens.mjs. Do not edit. */

:root,
[data-theme="${light}"] {
${decls(light)}
  color-scheme: ${light};
}

${darkBlocks}

:root {
${scalars}
${families}
}

${styles}
`;

writeFileSync(out, css);
console.log(`tokens.css written (${themed.length} themed, ${t.spacing.tokens.length + t.radius.tokens.length} scalar tokens)`);
