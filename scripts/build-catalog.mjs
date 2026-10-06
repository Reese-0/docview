import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { execFileSync } from "node:child_process";

const POSTS_DIR = "posts";
const OUTPUT = "catalog.json";
const SITE_URL = ""; // 若将来有自定义域名，可填 "https://example.com"；留空即相对路径

function gitDate(filePath) {
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%aI", "--", filePath],
      { encoding: "utf8" }
    ).trim();
    return out || null;
  } catch { return null; }
}

function pickMeta(html, re) {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function extractMeta(html) {
  const title =
    pickMeta(html, /<meta\s+name=["']title["']\s+content=["']([^"']*)["']/i) ||
    pickMeta(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const date       = pickMeta(html, /<meta\s+name=["']date["']\s+content=["']([^"']*)["']/i);
  const description= pickMeta(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  const tagsRaw    = pickMeta(html, /<meta\s+name=["']tags["']\s+content=["']([^"']*)["']/i);
  const tags = tagsRaw ? tagsRaw.split(/[,，\s]+/).filter(Boolean) : [];
  return { title, date, description, tags };
}

async function main() {
  let files = [];
  try {
    files = (await readdir(POSTS_DIR))
      .filter(f => extname(f).toLowerCase() === ".html");
  } catch {
    console.warn(`目录 ${POSTS_DIR}/ 不存在，生成空目录`);
  }

  const posts = [];
  const warnings = [];

  for (const f of files) {
    if (/[?#]/.test(f)) {
      warnings.push(`文件名含 "?" 或 "#"，会导致 URL 异常：${f}`);
    }
    const full = join(POSTS_DIR, f);
    const html = await readFile(full, "utf8");
    const meta = extractMeta(html);

    const fallbackTitle = basename(f, extname(f));
    const title = decodeEntities(meta.title || fallbackTitle);

    const gDate = gitDate(full);              // ISO 字符串
    const date  = meta.date || (gDate ? gDate.slice(0, 10) : "");

    // 用 encodeURIComponent 处理中文/全角字符
    const urlPath = `${POSTS_DIR}/${encodeURIComponent(f)}`;
    const url = SITE_URL ? SITE_URL.replace(/\/$/, "") + "/" + urlPath : urlPath;

    posts.push({
      title,
      file: f,
      url,
      date,
      updatedAt: gDate || "",
      description: meta.description ? decodeEntities(meta.description) : "",
      tags: meta.tags,
    });
  }

  posts.sort((a, b) => {
    if (a.date !== b.date) return (b.date || "").localeCompare(a.date || "");
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });

  const catalog = {
    generatedAt: new Date().toISOString(),
    count: posts.length,
    posts,
  };

  await writeFile(OUTPUT, JSON.stringify(catalog, null, 2), "utf8");
  console.log(`✅ 已生成 ${OUTPUT}，共 ${posts.length} 篇`);
  if (warnings.length) {
    console.warn("⚠️  警告：");
    warnings.forEach(w => console.warn("  - " + w));
  }
}

main().catch(err => { console.error(err); process.exit(1); });