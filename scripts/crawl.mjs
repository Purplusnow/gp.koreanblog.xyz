import fs from "fs";
import * as cheerio from "cheerio";

const BASE_URL = "https://play.google.com";
const DATA_PATH = "./docs/data/apps.json";
const MAX_ITEMS = 100;

const SOURCE_URLS = [
  "https://play.google.com/store/games?hl=ko&gl=KR",
  "https://play.google.com/store/apps/category/GAME?hl=ko&gl=KR",
  "https://play.google.com/store/apps/top/category/GAME?hl=ko&gl=KR",
  "https://play.google.com/store/search?q=game&c=apps&hl=ko&gl=KR",
  "https://play.google.com/store/search?q=rpg&c=apps&hl=ko&gl=KR",
  "https://play.google.com/store/search?q=idle&c=apps&hl=ko&gl=KR",
  "https://play.google.com/store/search?q=puzzle&c=apps&hl=ko&gl=KR",
  "https://play.google.com/store/search?q=strategy&c=apps&hl=ko&gl=KR",
  "https://play.google.com/store/search?q=simulation&c=apps&hl=ko&gl=KR",
  "https://play.google.com/store/search?q=arcade&c=apps&hl=ko&gl=KR"
];

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

function normalizePlayUrl(url) {
  try {
    const fullUrl = new URL(url, BASE_URL);
    fullUrl.searchParams.set("hl", "ko");
    fullUrl.searchParams.set("gl", "KR");
    return fullUrl.toString();
  } catch {
    return url;
  }
}

function parseAppIdFromHref(href) {
  try {
    const fullUrl = new URL(href, BASE_URL);
    return fullUrl.searchParams.get("id");
  } catch {
    return null;
  }
}

async function getCandidateAppIds() {
  const ids = new Set();

  for (const sourceUrl of SOURCE_URLS) {
    try {
      console.log(`SOURCE: ${sourceUrl}`);
      const html = await fetchHtml(sourceUrl);
      const $ = cheerio.load(html);

      $("a[href*='/store/apps/details']").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;

        const appId = parseAppIdFromHref(href);
        if (appId) ids.add(appId);
      });
    } catch (err) {
      console.error(`SOURCE FAIL: ${sourceUrl} / ${err.message}`);
    }

    await sleep(500);
  }

  return [...ids];
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

  return {
    appId,
    title,
    developer,
    genre,
    icon,
    url: normalizePlayUrl(url)
  };
}

async function main() {
  console.log("Collecting candidate app ids...");
  const appIds = await getCandidateAppIds();
  console.log(`Collected ${appIds.length} candidate ids`);

  const existingData = loadExistingData();
  const existingItems = Array.isArray(existingData.items) ? existingData.items : [];
  const seenSet = new Set(Array.isArray(existingData.seenAppIds) ? existingData.seenAppIds : []);

  for (const item of existingItems) {
    if (item.appId) seenSet.add(item.appId);
  }

  let addedCount = 0;

  for (const appId of appIds) {
    if (seenSet.has(appId)) {
      console.log(`SKIP SEEN: ${appId}`);
      continue;
    }

    try {
      const detail = await getAppDetail(appId);

      existingItems.push({
        ...detail,
        discoveredDate: todayKst()
      });

      seenSet.add(appId);
      addedCount += 1;

      console.log(`ADD: ${appId} / ${detail.title}`);
    } catch (err) {
      console.error(`FAIL: ${appId} / ${err.message}`);
    }

    await sleep(700);
  }

  existingItems.sort((a, b) => {
    const da = new Date(a.discoveredDate || 0).getTime();
    const db = new Date(b.discoveredDate || 0).getTime();
    return db - da;
  });

  const trimmed = existingItems.slice(0, MAX_ITEMS);

  const output = {
    updatedAt: new Date().toISOString(),
    seenAppIds: [...seenSet],
    items: trimmed
  };

  fs.mkdirSync("./docs/data", { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`Added ${addedCount}`);
  console.log(`Saved ${trimmed.length} visible items`);
  console.log(`Tracked ${seenSet.size} seen app ids`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
