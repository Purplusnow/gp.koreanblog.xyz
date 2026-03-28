import fs from "fs";
import * as cheerio from "cheerio";

const BASE_URL = "https://play.google.com";
const DATA_PATH = "./docs/data/apps.json";
const MAX_ITEMS = 3000;

const SOURCE_URLS = [
  "https://play.google.com/store/games?hl=ko&gl=KR",
  "https://play.google.com/store/apps/category/GAME?hl=ko&gl=KR",
  "https://play.google.com/store/apps/top/category/GAME?hl=ko&gl=KR",
  "https://play.google.com/store/search?q=game&c=apps&hl=ko&gl=KR",
  "https://play.google.com/store/search?q=games&c=apps&hl=ko&gl=KR",
  "https://play.google.com/store/search?q=mobile%20game&c=apps&hl=ko&gl=KR",
  "https://play.google.com/store/search?q=online%20game&c=apps&hl=ko&gl=KR",
  "https://play.google.com/store/search?q=%EA%B2%8C%EC%9E%84&c=apps&hl=ko&gl=KR",
  "https://play.google.com/store/search?q=%EB%AA%A8%EB%B0%94%EC%9D%BC%20%EA%B2%8C%EC%9E%84&c=apps&hl=ko&gl=KR",
  "https://play.google.com/store/search?q=%EC%98%A8%EB%9D%BC%EC%9D%B8%20%EA%B2%8C%EC%9E%84&c=apps&hl=ko&gl=KR"
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
      return { items: [], seenAppIds: [], seenItems: [] };
    }

    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const json = JSON.parse(raw);

    return {
      items: Array.isArray(json.items) ? json.items : [],
      seenAppIds: Array.isArray(json.seenAppIds) ? json.seenAppIds : [],
      seenItems: Array.isArray(json.seenItems) ? json.seenItems : []
    };
  } catch {
    return { items: [], seenAppIds: [], seenItems: [] };
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

  const categoryHrefs = [];
  $('a[href*="/store/apps/category/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href) categoryHrefs.push(href);
  });

  const isGame = categoryHrefs.some(href =>
    href.includes("/store/apps/category/GAME")
  );

  return {
    appId,
    title,
    developer,
    icon,
    url: normalizePlayUrl(url),
    isGame
  };
}

async function main() {
  console.log("Collecting candidate app ids...");
  const appIds = await getCandidateAppIds();
  console.log(`Collected ${appIds.length} candidate ids`);

  const existingData = loadExistingData();

  const existingItems = (Array.isArray(existingData.items) ? existingData.items : [])
    .filter(item => item.isGame !== false);

  const seenItems = Array.isArray(existingData.seenItems) ? existingData.seenItems : [];
  const seenSet = new Set(Array.isArray(existingData.seenAppIds) ? existingData.seenAppIds : []);

  for (const item of existingItems) {
    if (item.appId) seenSet.add(item.appId);
  }

  for (const item of seenItems) {
    if (item.appId) seenSet.add(item.appId);
  }

  let addedCount = 0;
  let skippedNonGame = 0;

  for (const appId of appIds) {
    if (seenSet.has(appId)) {
      console.log(`SKIP SEEN: ${appId}`);
      continue;
    }

    try {
      const detail = await getAppDetail(appId);

      if (!detail.isGame) {
        skippedNonGame += 1;
        console.log(`SKIP NON-GAME: ${appId} / ${detail.title}`);
        continue;
      }

      const newItem = {
        appId: detail.appId,
        title: detail.title,
        developer: detail.developer,
        icon: detail.icon,
        url: detail.url,
        discoveredDate: todayKst(),
        isGame: true
      };

      existingItems.push(newItem);
      seenItems.push(newItem);
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

  seenItems.sort((a, b) => {
    const da = new Date(a.discoveredDate || 0).getTime();
    const db = new Date(b.discoveredDate || 0).getTime();
    return db - da;
  });

  const trimmed = existingItems.slice(0, MAX_ITEMS);

  const output = {
    updatedAt: new Date().toISOString(),
    seenAppIds: [...seenSet],
    seenItems,
    items: trimmed
  };

  fs.mkdirSync("./docs/data", { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`Added ${addedCount}`);
  console.log(`Skipped non-games ${skippedNonGame}`);
  console.log(`Saved ${trimmed.length} visible items`);
  console.log(`Tracked ${seenSet.size} seen app ids`);
  console.log(`Saved ${seenItems.length} archive items`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
