import fs from "fs";
import * as cheerio from "cheerio";

const BASE_URL = "https://play.google.com";
const DATA_PATH = "./docs/data/apps.json";
const REVIEW_MAP_PATH = "./docs/data/review-map.json";
const MAX_ITEMS = 500;
const DETAIL_CONCURRENCY = 6;

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

function loadJson(path, fallback) {
  try {
    if (!fs.existsSync(path)) return fallback;
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function loadExistingData() {
  const json = loadJson(DATA_PATH, {});

  return {
    updatedAt: json.updatedAt || null,
    seenAppIds: Array.isArray(json.seenAppIds) ? json.seenAppIds : [],
    items: Array.isArray(json.items) ? json.items : []
  };
}

function loadReviewMap() {
  const json = loadJson(REVIEW_MAP_PATH, {});
  return json && typeof json === "object" ? json : {};
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

function normalizeItem(item, todayStr) {
  return {
    appId: item.appId,
    title: item.title || "",
    developer: item.developer || "",
    icon: item.icon || "",
    url: item.url ? normalizePlayUrl(item.url) : "",
    discoveredDate: item.discoveredDate || todayStr,
    isGame: item.isGame !== false
  };
}

function mergeItems(oldItems, newItems, todayStr) {
  const map = new Map();

  for (const item of oldItems) {
    if (!item || !item.appId) continue;
    map.set(item.appId, normalizeItem(item, todayStr));
  }

  for (const item of newItems) {
    if (!item || !item.appId) continue;

    const normalized = normalizeItem(item, todayStr);
    const existing = map.get(normalized.appId);

    if (existing) {
      map.set(normalized.appId, {
        ...existing,
        ...normalized,
        discoveredDate: existing.discoveredDate || normalized.discoveredDate || todayStr
      });
    } else {
      map.set(normalized.appId, normalized);
    }
  }

  return Array.from(map.values());
}

function hasReview(item, reviewMap) {
  const reviewUrl = reviewMap[item.appId];
  return Boolean(reviewUrl && String(reviewUrl).trim());
}

function pruneToLimit(items, reviewMap, limit = MAX_ITEMS) {
  const reviewed = [];
  const unreviewed = [];

  for (const item of items) {
    if (!item || !item.appId) continue;
    if (hasReview(item, reviewMap)) reviewed.push(item);
    else unreviewed.push(item);
  }

  reviewed.sort((a, b) => {
    const da = new Date(a.discoveredDate || 0).getTime();
    const db = new Date(b.discoveredDate || 0).getTime();
    return db - da;
  });

  unreviewed.sort((a, b) => {
    const da = new Date(a.discoveredDate || 0).getTime();
    const db = new Date(b.discoveredDate || 0).getTime();
    return da - db;
  });

  if (reviewed.length >= limit) {
    return reviewed;
  }

  const keepUnreviewedCount = Math.max(0, limit - reviewed.length);
  const keptUnreviewed = unreviewed.slice(-keepUnreviewedCount);

  return [...reviewed, ...keptUnreviewed].sort((a, b) => {
    const da = new Date(a.discoveredDate || 0).getTime();
    const db = new Date(b.discoveredDate || 0).getTime();
    return db - da;
  });
}

async function getCandidateAppIds() {
  const ids = new Set();

  const results = await Promise.allSettled(
    SOURCE_URLS.map(async (sourceUrl) => {
      console.log(`SOURCE: ${sourceUrl}`);
      const html = await fetchHtml(sourceUrl);
      const $ = cheerio.load(html);

      $("a[href*='/store/apps/details']").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;

        const appId = parseAppIdFromHref(href);
        if (appId) ids.add(appId);
      });
    })
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`SOURCE FAIL: ${SOURCE_URLS[index]} / ${result.reason?.message || result.reason}`);
    }
  });

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

  const isGame = categoryHrefs.some((href) => href.includes("/store/apps/category/GAME"));

  return {
    appId,
    title,
    developer,
    icon,
    url: normalizePlayUrl(url),
    isGame
  };
}

async function mapWithConcurrency(items, worker, concurrency = DETAIL_CONCURRENCY) {
  const results = [];
  let cursor = 0;

  async function runner() {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;

      if (currentIndex >= items.length) return;

      const item = items[currentIndex];
      const result = await worker(item, currentIndex);
      if (result) results.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runner());
  await Promise.all(workers);
  return results;
}

async function fetchDetailsForNewApps(appIds, todayStr) {
  return await mapWithConcurrency(
    appIds,
    async (appId) => {
      try {
        const detail = await getAppDetail(appId);

        if (!detail.isGame) {
          console.log(`SKIP NON-GAME: ${appId} / ${detail.title}`);
          return null;
        }

        console.log(`ADD: ${appId} / ${detail.title}`);

        return {
          appId: detail.appId,
          title: detail.title,
          developer: detail.developer,
          icon: detail.icon,
          url: detail.url,
          discoveredDate: todayStr,
          isGame: true
        };
      } catch (err) {
        console.error(`FAIL: ${appId} / ${err.message}`);
        return null;
      } finally {
        await sleep(250);
      }
    },
    DETAIL_CONCURRENCY
  );
}

async function main() {
  const todayStr = todayKst();
  const existingData = loadExistingData();
  const reviewMap = loadReviewMap();

  console.log("Collecting candidate app ids...");
  const candidateAppIds = await getCandidateAppIds();
  console.log(`Collected ${candidateAppIds.length} candidate ids`);

  const existingItems = mergeItems(existingData.items, [], todayStr).filter((item) => item.isGame !== false);
  const existingMap = new Map(existingItems.map((item) => [item.appId, item]));
  const seenAppIds = new Set(existingData.seenAppIds.filter(Boolean));

  for (const appId of existingMap.keys()) {
    seenAppIds.add(appId);
  }

  const uniqueCandidateAppIds = [...new Set(candidateAppIds)].filter(Boolean);

  let skippedSeen = 0;
  const trulyNewAppIds = [];

  for (const appId of uniqueCandidateAppIds) {
    if (seenAppIds.has(appId)) {
      skippedSeen += 1;
      continue;
    }
    trulyNewAppIds.push(appId);
  }

  console.log(`New candidate ids: ${trulyNewAppIds.length}`);
  const newItems = await fetchDetailsForNewApps(trulyNewAppIds, todayStr);

  for (const item of newItems) {
    seenAppIds.add(item.appId);
  }

  const mergedItems = mergeItems(existingItems, newItems, todayStr);
  const finalItems = pruneToLimit(mergedItems, reviewMap, MAX_ITEMS);

  const reviewedCount = finalItems.filter((item) => hasReview(item, reviewMap)).length;
  const unreviewedCount = finalItems.length - reviewedCount;

  const output = {
    updatedAt: new Date().toISOString(),
    seenAppIds: Array.from(seenAppIds),
    items: finalItems
  };

  fs.mkdirSync("./docs/data", { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`Skipped seen ${skippedSeen}`);
  console.log(`Added ${newItems.length}`);
  console.log(`Saved ${finalItems.length} visible items`);
  console.log(`Reviewed kept ${reviewedCount}`);
  console.log(`Unreviewed kept ${unreviewedCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
