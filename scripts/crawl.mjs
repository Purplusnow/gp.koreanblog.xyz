import fs from "fs";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const BASE_URL = "https://play.google.com";
const LIST_URL =
  "https://play.google.com/store/apps/collection/promotion_3000791_new_releases_games?hl=ko&gl=KR";
const DATA_PATH = "./docs/data/apps.json";
const MAX_ITEMS = 100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayKst() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function loadExistingData() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      return { items: [], seenAppIds: [] };
    }

    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const json = JSON.parse(raw);

    return {
      items: Array.isArray(json.items) ? json.items : [],
      seenAppIds: Array.isArray(json.seenAppIds) ? json.seenAppIds : []
    };
  } catch {
    return { items: [], seenAppIds: [] };
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
    } catch {}
  });

  return [...ids];
}

function extractDownloads($) {
  let value = "";

  $("div, span").each((_, el) => {
    const text = $(el).text().trim();

    // 반드시 다운로드 문구 포함된 경우만
    if (
      text.toLowerCase().includes("downloads") ||
      text.includes("다운로드")
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

  const existingData = loadExistingData();
  const existingItems = existingData.items;
  const seenSet = new Set(existingData.seenAppIds);

  // 기존 items도 seen에 포함
  for (const item of existingItems) {
    if (item.appId) seenSet.add(item.appId);
  }

  let addedCount = 0;

  for (const appId of appIds.slice(0, 500)) {
    if (seenSet.has(appId)) {
      console.log(`SKIP: ${appId}`);
      continue;
    }

    try {
      const detail = await getAppDetail(appId);

      existingItems.push({
        ...detail,
        discoveredDate: todayKst()
      });

      seenSet.add(appId);
      addedCount++;

      console.log(`ADD: ${appId} / ${detail.title}`);
    } catch (err) {
      console.error(`FAIL: ${appId}`);
    }

    await sleep(700);
  }

  // 최신순 정렬
  existingItems.sort((a, b) => {
    const da = new Date(a.discoveredDate || 0).getTime();
    const db = new Date(b.discoveredDate || 0).getTime();
    return db - da;
  });

  // 100개 제한
  const trimmed = existingItems.slice(0, MAX_ITEMS);

  const output = {
    updatedAt: new Date().toISOString(),
    seenAppIds: [...seenSet],
    items: trimmed
  };

  fs.mkdirSync("./docs/data", { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2));

  console.log(`Added ${addedCount}`);
  console.log(`Total saved: ${trimmed.length}`);
}

main().catch(console.error);
