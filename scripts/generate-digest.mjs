import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const API_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const MAX_PAPERS = clamp(Number(process.env.DIGEST_MAX_PAPERS || 5), 1, 8);
const TZ = "America/New_York";

const today = process.env.DIGEST_DATE || dateInTimeZone(new Date(), TZ);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  throw new Error(`Invalid DIGEST_DATE: ${today}`);
}
const digestDir = path.join(ROOT, "digests");
const imageDir = path.join(ROOT, "images", today);
const dataDir = path.join(ROOT, "data");
const historyPath = path.join(dataDir, "reported-papers.json");

if (!process.env.OPENAI_API_KEY && !process.env.DIGEST_FIXTURE) {
  throw new Error("OPENAI_API_KEY is required.");
}

await Promise.all([
  fs.mkdir(digestDir, { recursive: true }),
  fs.mkdir(imageDir, { recursive: true }),
  fs.mkdir(dataDir, { recursive: true }),
]);

const history = await readJson(historyPath, []);
const recentHistory = history.slice(-250).map(({ title, url, reported_at }) => ({
  title,
  url,
  reported_at,
}));

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "papers", "themes"],
  properties: {
    headline: { type: "string" },
  papers: {
      type: "array",
      minItems: 1,
      maxItems: MAX_PAPERS,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "selection_lane",
          "inclusion_reason",
          "url",
          "release_date",
          "status",
          "venue",
          "authors",
          "summary",
          "technical_contribution",
          "why_it_matters",
          "evidence_note",
          "keywords",
          "figure",
        ],
        properties: {
          title: { type: "string" },
          selection_lane: {
            type: "string",
            enum: ["New or updated", "Important to revisit"],
          },
          inclusion_reason: { type: "string" },
          url: { type: "string" },
          release_date: { type: "string" },
          status: { type: "string", enum: ["peer-reviewed", "preprint"] },
          venue: { type: "string" },
          authors: { type: "string" },
          summary: { type: "string" },
          technical_contribution: { type: "string" },
          why_it_matters: { type: "string" },
          evidence_note: { type: "string" },
          keywords: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            items: { type: "string" },
          },
          figure: {
            type: "object",
            additionalProperties: false,
            required: ["inputs", "preprocessing", "model", "objectives", "outputs", "caveat"],
            properties: {
              inputs: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
              preprocessing: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
              model: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } },
              objectives: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
              outputs: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
              caveat: { type: "string" },
            },
          },
        },
      },
    },
    themes: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" },
    },
  },
};

const prompt = `
You are preparing a rigorous daily research brief for a statistical genomics researcher.
Today is ${today} in America/New_York.

Find ${MAX_PAPERS} or fewer important spatial-omics data-modeling papers using two
complementary selection lanes:
1. "New or updated": newly released, published, or substantively updated work.
2. "Important to revisit": older work that is foundational, influential, technically
   distinctive, newly relevant to current trends, underappreciated, or previously missed.

Search the web and prioritize primary sources: journal article pages, bioRxiv/medRxiv,
arXiv, conference proceedings, or official repositories linked from the paper. There is
no publication-date cutoff for the second lane. Prefer a useful mix of lanes when strong
candidates exist, but return fewer papers rather than padding the digest.

Scope:
- spatial transcriptomics and broader spatial omics
- statistical modeling, machine learning, foundation models, representation learning
- spatial domains, deconvolution, cell segmentation, cell-cell communication
- multimodal integration, uncertainty quantification, dynamics, and benchmarking

Selection rules:
- Include only papers whose title, date, status, and primary URL you verified.
- Prefer methodological novelty and likely field impact over application-only studies.
- Set selection_lane for every paper. For older papers, inclusion_reason must explain
  specifically why the paper merits attention now; for new work, state what is timely.
- Do not invent architecture components, loss functions, results, or claims.
- For evidence_note, briefly state what primary page supports the summary.
- The figure fields must be technically detailed but strictly grounded in verified content.
- If an implementation detail cannot be verified, omit it and mention the limitation in caveat.
- Do not repeat items in the history below unless there is a substantive update.
- Return fewer papers when evidence is weak. Never pad the list.

Previously reported items:
${JSON.stringify(recentHistory)}
`;

let digest;
if (process.env.DIGEST_FIXTURE) {
  digest = await readJson(path.resolve(process.env.DIGEST_FIXTURE), null);
  if (!digest) throw new Error(`Could not read fixture: ${process.env.DIGEST_FIXTURE}`);
} else {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: "high" },
      tools: [{ type: "web_search" }],
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "spatial_omics_digest",
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${body}`);
  }

  const apiResult = await response.json();
  const outputText = extractOutputText(apiResult);
  digest = JSON.parse(outputText);
}

const uniquePapers = deduplicate(digest.papers, history).slice(0, MAX_PAPERS);
if (uniquePapers.length === 0) {
  console.log("No new verified papers were found; leaving the archive unchanged.");
  process.exit(0);
}

const paperSections = [];
for (let i = 0; i < uniquePapers.length; i += 1) {
  const paper = uniquePapers[i];
  validatePaper(paper);
  const slug = slugify(paper.title).slice(0, 70).replace(/-+$/g, "") || `paper-${i + 1}`;
  const imageName = `${String(i + 1).padStart(2, "0")}-${slug}.svg`;
  const imagePath = path.join(imageDir, imageName);
  await fs.writeFile(imagePath, renderTechnicalFigure(paper, i), "utf8");
  paperSections.push(renderPaper(paper, imageName, i + 1));
}

const digestPath = path.join(digestDir, `${today}.md`);
const digestMarkdown = `# Spatial Omics Modeling Brief

**${formatHumanDate(today)}**

${escapeMarkdown(digest.headline)}

${paperSections.join("\n\n")}

## What to watch

${digest.themes.map((theme) => `- ${escapeMarkdown(theme)}`).join("\n")}

---

_Figures are original, structured visual summaries generated from verified paper descriptions. They are not reproduced publication figures. Technical elements that could not be verified are explicitly excluded or qualified._
`;

await fs.writeFile(digestPath, digestMarkdown, "utf8");

const updatedHistory = [
  ...history,
  ...uniquePapers.map((paper) => ({
    title: paper.title,
    url: paper.url,
    release_date: paper.release_date,
    reported_at: today,
  })),
];
await fs.writeFile(historyPath, `${JSON.stringify(updatedHistory, null, 2)}\n`, "utf8");

const readme = renderReadme(today, uniquePapers, digest.themes);
await fs.writeFile(path.join(ROOT, "README.md"), readme, "utf8");

const issueBody = renderIssueBody(today, uniquePapers, digest.themes);
await fs.writeFile(path.join(ROOT, ".digest-issue-body.md"), issueBody, "utf8");

console.log(`Generated ${path.relative(ROOT, digestPath)} with ${uniquePapers.length} papers.`);

function extractOutputText(result) {
  if (typeof result.output_text === "string" && result.output_text.trim()) {
    return result.output_text;
  }
  for (const item of result.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("The Responses API returned no output text.");
}

function deduplicate(papers, previous) {
  const known = new Set(previous.flatMap((p) => [normalize(p.title), normalize(p.url)]));
  const seen = new Set();
  return papers.filter((paper) => {
    const keys = [normalize(paper.title), normalize(paper.url)];
    if (keys.some((key) => !key || known.has(key) || seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
}

function validatePaper(paper) {
  const url = new URL(paper.url);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Invalid URL: ${paper.url}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paper.release_date)) {
    throw new Error(`Invalid release date for ${paper.title}: ${paper.release_date}`);
  }
}

function renderPaper(paper, imageName, index) {
  const relImage = `../images/${today}/${imageName}`;
  return `## ${index}. [${escapeMarkdown(paper.title)}](${paper.url})

**${escapeMarkdown(paper.selection_lane)} | ${paper.status === "peer-reviewed" ? "Peer reviewed" : "Preprint"} | ${escapeMarkdown(paper.venue)} | ${escapeMarkdown(paper.release_date)}**

![Technical summary of ${escapeAlt(paper.title)}](${relImage})

${escapeMarkdown(paper.summary)}

**Why included now:** ${escapeMarkdown(paper.inclusion_reason)}

**Technical contribution:** ${escapeMarkdown(paper.technical_contribution)}

**Why it matters:** ${escapeMarkdown(paper.why_it_matters)}

**Verification:** ${escapeMarkdown(paper.evidence_note)}

**Keywords:** ${paper.keywords.map((keyword) => `\`${escapeCode(keyword)}\``).join(" ")}`;
}

function renderTechnicalFigure(paper, paletteIndex) {
  const palettes = [
    ["#0f4c5c", "#2a9d8f", "#e76f51", "#f4a261"],
    ["#3d405b", "#5f6caf", "#9c6ade", "#f2cc8f"],
    ["#16324f", "#2e86ab", "#a23b72", "#f18f01"],
  ];
  const colors = palettes[paletteIndex % palettes.length];
  const columns = [
    ["Inputs", paper.figure.inputs],
    ["Preprocessing", paper.figure.preprocessing],
    ["Model / inference", paper.figure.model],
    ["Objectives", paper.figure.objectives],
    ["Outputs", paper.figure.outputs],
  ];
  const width = 1600;
  const height = 900;
  const boxWidth = 276;
  const gap = 32;
  const startX = 34;
  const boxY = 168;
  const boxHeight = 520;
  const title = wrapText(paper.title, 62).slice(0, 2);

  const boxes = columns.map(([heading, items], col) => {
    const x = startX + col * (boxWidth + gap);
    const color = colors[col % colors.length];
    let y = boxY + 90;
    const itemSvg = items.slice(0, 6).map((item) => {
      const lines = wrapText(item, 29).slice(0, 3);
      const block = `
        <circle cx="${x + 28}" cy="${y - 5}" r="6" fill="${color}"/>
        ${lines.map((line, idx) => `<text x="${x + 46}" y="${y + idx * 27}" class="item">${xml(line)}</text>`).join("")}`;
      y += Math.max(58, lines.length * 27 + 20);
      return block;
    }).join("");
    const arrow = col < columns.length - 1
      ? `<path d="M ${x + boxWidth + 5} ${boxY + 250} H ${x + boxWidth + gap - 7}" class="arrow"/>`
      : "";
    return `
      <rect x="${x}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="22" fill="#ffffff" stroke="${color}" stroke-width="4"/>
      <rect x="${x}" y="${boxY}" width="${boxWidth}" height="64" rx="20" fill="${color}"/>
      <rect x="${x}" y="${boxY + 42}" width="${boxWidth}" height="22" fill="${color}"/>
      <text x="${x + boxWidth / 2}" y="${boxY + 42}" text-anchor="middle" class="box-title">${xml(heading)}</text>
      ${itemSvg}
      ${arrow}`;
  }).join("");

  const caveatLines = wrapText(`Scope note: ${paper.figure.caveat}`, 130).slice(0, 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${xml(paper.title)} technical summary</title>
  <desc id="desc">A five-stage diagram showing inputs, preprocessing, model, objectives, and outputs.</desc>
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#718096"/>
    </marker>
    <style>
      .title { font: 700 40px Arial, sans-serif; fill: #17202a; }
      .subtitle { font: 500 21px Arial, sans-serif; fill: #52616b; }
      .box-title { font: 700 24px Arial, sans-serif; fill: white; }
      .item { font: 500 20px Arial, sans-serif; fill: #243442; }
      .note { font: 500 18px Arial, sans-serif; fill: #425466; }
      .arrow { stroke: #718096; stroke-width: 5; fill: none; marker-end: url(#arrowhead); }
    </style>
  </defs>
  <rect width="1600" height="900" fill="#f8fafc"/>
  ${title.map((line, idx) => `<text x="50" y="${62 + idx * 45}" class="title">${xml(line)}</text>`).join("")}
  <text x="1550" y="62" text-anchor="end" class="subtitle">${xml(paper.status)} | ${xml(paper.release_date)}</text>
  ${boxes}
  <rect x="34" y="728" width="1512" height="122" rx="18" fill="#edf2f7"/>
  ${caveatLines.map((line, idx) => `<text x="62" y="${774 + idx * 30}" class="note">${xml(line)}</text>`).join("")}
</svg>
`;
}

function renderReadme(date, papers, themes) {
  return `# Spatial Omics Research Digest

An automated daily archive of cutting-edge spatial-omics data-modeling research.

## Latest digest

[Read the ${formatHumanDate(date)} digest](digests/${date}.md)

${papers.map((paper) => `- [${escapeMarkdown(paper.title)}](${paper.url}) - ${paper.status}, ${paper.release_date}`).join("\n")}

## Emerging themes

${themes.map((theme) => `- ${escapeMarkdown(theme)}`).join("\n")}

## Archive

Browse the [dated digests](digests/) and their [technical visual summaries](images/).

## Automation

GitHub Actions runs the workflow each morning at approximately 8:00 AM
America/New_York, commits the report, and opens an issue so repository watchers
can receive a GitHub or email notification.

See [SETUP.md](SETUP.md) for configuration.
`;
}

function renderIssueBody(date, papers, themes) {
  const repo = process.env.GITHUB_REPOSITORY || "OWNER/REPOSITORY";
  const branch = process.env.GITHUB_REF_NAME || "main";
  const digestUrl = `https://github.com/${repo}/blob/${branch}/digests/${date}.md`;
  return `The [${formatHumanDate(date)} spatial omics digest](${digestUrl}) is ready.

${papers.map((paper) => `- **[${paper.title}](${paper.url})** - ${paper.why_it_matters}`).join("\n")}

**What to watch:** ${themes.join("; ")}

_This issue was created automatically. Watch the repository or subscribe to the \`research-digest\` label for notifications._
`;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function dateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatHumanDate(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${iso}T12:00:00Z`));
}

function normalize(value = "") {
  return value.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function wrapText(value, maxChars) {
  const words = String(value).trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= maxChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function xml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[char]);
}

function escapeMarkdown(value) {
  return String(value).replace(/([\\`*_{}[\]|>])/g, "\\$1");
}

function escapeAlt(value) {
  return String(value).replace(/[[\]]/g, "");
}

function escapeCode(value) {
  return String(value).replace(/`/g, "");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
