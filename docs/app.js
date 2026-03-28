let originalItems = [];
let reviewMap = {};

async function loadApps() {
  const appListEl = document.getElementById("appList");
  const updatedAtEl = document.getElementById("updatedAt");
  const statsEl = document.getElementById("stats");

  try {
    appListEl.innerHTML = `<div class="empty">데이터 불러오는 중...</div>`;

    // apps.json
    const res = await fetch("./data/apps.json");
    const data = await res.json();

    // review-map.json
    const reviewRes = await fetch("./data/review-map.json");
    reviewMap = await reviewRes.json();

    originalItems = Array.isArray(data.items) ? data.items : [];

    updatedAtEl.textContent = `마지막 업데이트: ${formatDateTime(data.updatedAt)}`;
    statsEl.textContent = `총 ${originalItems.length}개 게임`;

    render();
  } catch (err) {
    console.error("loadApps error:", err);
    appListEl.innerHTML = `<div class="empty">데이터를 불러오지 못했습니다</div>`;
  }
}

function formatDate(dateStr) {
  return dateStr || "-";
}

function formatDateTime(dateStr) {
  if (!dateStr) return "-";

  const date = new Date(dateStr);

  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function render() {
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const statsEl = document.getElementById("stats");
  const appListEl = document.getElementById("appList");

  const keyword = searchInput.value.trim().toLowerCase();
  const sort = sortSelect.value;

  let items = [...originalItems];

  if (keyword) {
    items = items.filter(item =>
      (item.title || "").toLowerCase().includes(keyword) ||
      (item.developer || "").toLowerCase().includes(keyword)
    );
  }

  items.sort((a, b) => {
    const da = new Date(a.discoveredDate || 0).getTime();
    const db = new Date(b.discoveredDate || 0).getTime();
    return sort === "desc" ? db - da : da - db;
  });

  statsEl.textContent = `총 ${items.length}개 게임`;

  if (!items.length) {
    appListEl.innerHTML = `<div class="empty">조건에 맞는 게임이 없습니다.</div>`;
    return;
  }

  appListEl.innerHTML = items.map(item => {
    const reviewUrl = reviewMap[item.appId];

    return `
      <article class="card">
        <img src="${item.icon || ""}" />
        <div class="card-body">
          <h2>${item.title || "-"}</h2>
          <p>개발사: ${item.developer || "-"}</p>
          <p>추천일: ${formatDate(item.discoveredDate)}</p>
        </div>
        ${
          reviewUrl
            ? `<a href="${reviewUrl}" target="_blank">리뷰 보기</a>`
            : `<a href="${item.url}" target="_blank">구글플레이</a>`
        }
      </article>
    `;
  }).join("");
}

document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("sortSelect").addEventListener("change", render);

loadApps();
