let originalItems = [];

async function loadApps() {
  const appListEl = document.getElementById("appList");
  const updatedAtEl = document.getElementById("updatedAt");
  const statsEl = document.getElementById("stats");

  try {
    appListEl.innerHTML = `<div class="empty">데이터 불러오는 중...</div>`;

    const res = await fetch("./data/apps.json");

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    originalItems = Array.isArray(data.items) ? data.items : [];

    updatedAtEl.textContent = `마지막 업데이트: ${formatDateTime(data.updatedAt)}`;
    statsEl.textContent = `총 ${originalItems.length}개 게임`;

    render();
  } catch (err) {
    console.error("loadApps error:", err);
    appListEl.innerHTML = `<div class="empty">데이터를 불러오지 못했습니다: ${escapeHtml(err.message)}</div>`;
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

  appListEl.innerHTML = items.map(item => `
    <article class="card">
      <img src="${item.icon || ""}" alt="${escapeHtml(item.title || "")}" />
      <div class="card-body">
        <h2 class="card-title">${escapeHtml(item.title || "-")}</h2>
        <p class="card-meta">개발사: ${escapeHtml(item.developer || "-")}</p>
        <p class="card-meta">장르: ${escapeHtml(item.genre || "-")}</p>
        <p class="card-meta">발견일: ${escapeHtml(formatDate(item.discoveredDate))}</p>
      </div>
      <a href="${item.url || "#"}" target="_blank" rel="noopener noreferrer">바로가기</a>
    </article>
  `).join("");
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("sortSelect").addEventListener("change", render);

loadApps();
