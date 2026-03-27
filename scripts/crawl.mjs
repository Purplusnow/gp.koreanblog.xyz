import fs from "fs";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const BASE_URL = "https://play.google.com";
const LIST_URL =
  "https://play.google.com/store/apps/collection/promotion_3000791_new_releases_games?hl=ko&gl=KR";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDate(date) {
  return date.toISOString().slice(0, 10);
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.8"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return await res.text();
}

async function getListAppIds() {
  const html = await fetchHtml(LIST_URL);
  const $ = cheerio.load(html);

  const ids = new Set();

  $("a[href*='/store/apps/details']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    try {
      const fullUrl = new URL(href, BASE_URL);
      const id = fullUrl.searchParams.get("id");
      if (id) ids.add(id);
    } catch {
      // ignore
    }
  });

  return [...ids];
}

function extractTextByLabel($, labelText) {
  let found = "";

  $("div, span").each((_, el) => {
    const text = $(el).text().trim();
    if (text === labelText) {
      const parentText = $(el).parent().text().trim();
      if (parentText && parentText !== labelText) {
        found = parentText.replace(labelText, "").trim();
        return false;
      }
    }
  });

  return found;
}

async function getAppDetail(appId) {
  const url = `${BASE_URL}/store/apps/details?id=${encodeURIComponent(appId)}&hl=ko&gl=KR`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const title =
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "";

  const developer =
    $('a[href*="/store/apps/dev"]').first().text().trim() ||
    $('meta[name="author"]').attr("content")?.trim() ||
    "";

  const icon =
    $('meta[property="og:image"]').attr("content") ||
    $("img").first().attr("src") ||
    "";

  const genre =
    $('a[href*="/store/apps/category/"]').first().text().trim() || "";

  let releaseDate =
    extractTextByLabel($, "출시일") ||
    extractTextByLabel($, "출시됨") ||
    "";

  return {
    appId,
    title,
    developer,
    genre,
    releaseDate,
    icon,
    url,
    detectedAt: new Date().toISOString()
  };
}

function toDateValue(value) {
  if (!value) return null;

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const normalized = value.replace(/\./g, "-").replace(/\s/g, "");
  const alt = new Date(normalized);
  if (!Number.isNaN(alt.getTime())) return alt;

  return null;
}

async function main() {
  console.log("Fetching app list...");
  const appIds = await getListAppIds();
  console.log(`Found ${appIds.length} app ids`);

  const items = [];

  for (const appId of appIds.slice(0, 30)) {
    try {
      const item = await getAppDetail(appId);
      items.push(item);
      console.log(`OK: ${appId} / ${item.title}`);
    } catch (err) {
      console.error(`FAIL: ${appId}`, err.message);
    }
    await sleep(700);
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const filtered = items
    .map((item) => {
      const parsed = toDateValue(item.releaseDate);
      return {
        ...item,
        sortDate: parsed ? normalizeDate(parsed) : normalizeDate(new Date(item.detectedAt)),
        dateType: parsed ? "released" : "detected"
      };
    })
    .filter((item) => {
      const d = new Date(item.sortDate);
      return d >= sevenDaysAgo;
    })
    .sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate))
    .map(({ sortDate, ...rest }) => ({
      ...rest,
      releaseDate: sortDate
    }));

  const output = {
    updatedAt: new Date().toISOString(),
    items: filtered
  };

  fs.mkdirSync("./docs/data", { recursive: true });
  fs.writeFileSync("./docs/data/apps.json", JSON.stringify(output, null, 2), "utf8");

  console.log(`Saved ${filtered.length} items to docs/data/apps.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
