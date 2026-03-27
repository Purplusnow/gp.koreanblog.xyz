import fs from "fs";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const BASE_URL = "https://play.google.com";
const LIST_URL =
  "https://play.google.com/store/apps/collection/promotion_3000791_new_releases_games?hl=ko&gl=KR";
const DATA_PATH = "./docs/data/apps.json";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayKst() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function loadExistingMap() {
  try {
    if (!fs.existsSync(DATA_PATH)) return new Map();
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const json = JSON.parse(raw);
    const items = Array.isArray(json.items) ? json.items : [];
    return new Map(items.map((item) => [item.appId, item]));
  } catch {
    return new Map();
  }
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

function extractDownloads($) {
  let value = "";

  $("div, span").each((_, el) => {
    const text = $(el).text().trim();

    if (
      /^(\d[\d,.]*[KMB]?\+?)$/i.test(text) ||
      /^(\d[\d,.]*\s*[만억]?\+?)$/i.test(text)
    ) {
      const parentText = $(el).parent().text().trim();

      if (
        parentText.includes("다운로드") ||
        parentText.toLowerCase().includes("downloads")
      ) {
        value = text;
        return false;
      }
    }

    if (
      text.includes("다운로드") ||
      text.toLowerCase().includes("downloads")
    ) {
      const match = text.match(/(\d[\d,.]*\s*[KMB]?\+?)/i);
      if (match) {
        value = match[1].trim();
        return false;
      }
    }
  });

  return value;
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

  const possibleGenres = [];
  $('a[href*="/store/apps/category/"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text) possibleGenres.push(text);
  });

  const genre = possibleGenres[0] || "";
  const downloads = extractDownloads($);

  return {
    appId,
    title,
    developer,
    genre,
    downloads,
    icon,
    url
  };
}

async function main() {
  console.log("Fetching app list...");
  const appIds = await getListAppIds();
  console.log(`Found ${appIds.length} app ids`);

  const existingMap = loadExistingMap();
  const items = [];

  for (const appId of appIds.slice(0, 50)) {
    try {
      const detail = await getAppDetail(appId);
      const prev = existingMap.get(appId);

      items.push({
        ...detail,
        detectedDate: prev?.detectedDate || todayKst(),
        dateType: "detected"
      });

      console.log(`OK: ${appId} / ${detail.title}`);
    } catch (err) {
      console.error(`FAIL: ${appId} / ${err.message}`);
    }

    await sleep(700);
  }

  items.sort((a, b) => {
    const da = new Date(a.detectedDate || 0).getTime();
    const db = new Date(b.detectedDate || 0).getTime();
    return db - da;
  });

  const output = {
    updatedAt: new Date().toISOString(),
    items
  };

  fs.mkdirSync("./docs/data", { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`Saved ${items.length} items to ${DATA_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
