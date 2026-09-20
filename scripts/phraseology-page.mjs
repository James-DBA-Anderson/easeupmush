import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const phraseologyPath = resolve(root, "shared/phraseology.json");

const MARKER = "<!-- PHRASEOLOGY -->";

/**
 * @typedef {{ phrase: string, meaning: string }} Phrase
 * @typedef {{ title: string, body: string }} Note
 * @typedef {{
 *   lede: string[],
 *   phrasesHeading: string,
 *   phrases: Phrase[],
 *   notes: Note[],
 * }} Phraseology
 */

/** @param {string} text */
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Bold `**…**` then italic `*…*` after HTML escaping. */
function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function loadPhraseology() {
  /** @type {Phraseology} */
  return JSON.parse(readFileSync(phraseologyPath, "utf8"));
}

/** @param {Phraseology} data */
function renderPhraseology(data) {
  const lede = data.lede
    .map((p) => `          <p>\n            ${inline(p)}\n          </p>`)
    .join("\n");

  const rows = data.phrases
    .map(
      (entry) => `              <tr>
                <th scope="row">${escapeHtml(entry.phrase)}</th>
                <td>
                  ${inline(entry.meaning)}
                </td>
              </tr>`,
    )
    .join("\n");

  const notes = data.notes
    .map(
      (note) => `        <section class="about__section">
          <h2>${escapeHtml(note.title)}</h2>
          <p>
            ${inline(note.body)}
          </p>
        </section>`,
    )
    .join("\n\n");

  return `        <section class="about__section">
${lede}
        </section>

        <section class="about__section">
          <h2>${escapeHtml(data.phrasesHeading)}</h2>
          <table class="lingo">
            <thead>
              <tr>
                <th scope="col">Phrase</th>
                <th scope="col">Meaning / use</th>
              </tr>
            </thead>
            <tbody>
${rows}
            </tbody>
          </table>
        </section>

${notes}`;
}

function isPhraseologyPage(html) {
  return html.includes(MARKER);
}

/** Fill `/mush/phraseology/` from `shared/phraseology.json`. */
export function phraseologyPagePlugin() {
  return {
    name: "phraseology-page",
    configureServer(/** @type {import("vite").ViteDevServer} */ server) {
      server.watcher.add(phraseologyPath);
      server.watcher.on("change", (file) => {
        if (file === phraseologyPath) {
          server.ws.send({ type: "full-reload" });
        }
      });
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (!isPhraseologyPage(html)) return html;
        return html.replace(MARKER, renderPhraseology(loadPhraseology()));
      },
    },
  };
}
