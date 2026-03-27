let originalItems = [];

async function loadApps() {
  try {
    const res = await fetch("/data/apps.json");
    const data = await res.json();

    originalItems = data.items || [];

    document.getElementById("updatedAt").textContent =
      `마지막 업데이트: ${formatDateTime(data.updatedAt)}`;

    render();
  } catch (err) {
    console.error(err);
    document.getElementById("appList").innerHTML =
      `<div class="empty">데이터를 불러오지 못했습니다.</div>`;
  }
}

function formatDate(dateStr) {
  return dateStr;
}

function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  return dateStr.replace("T", " ").replace("+09:00", " KST");
}

function render() {
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
  const sort = document.getElementById("sortSelect").value;

  let items = [...originalItems];

  if (keyword) {
    items = items.filter(item =>
      (item.title || "").toLowerCase().includes(keyword) ||
      (item.developer || "").toLowerCase().includes(keyword)
    );
  }

  items.sort((a, b) => {
    const da = new Date(a.releaseDate).getTime();
    const db = new Date(b.releaseDate).getTime();
    return sort === "desc" ? db - da : da - db;
  });

  document.getElementById("stats").textContent = `총 ${items.length}개 게임`;

  const appList = document.getElementById("appList");

  if (!items.length) {
    appList.innerHTML = `<div class="empty">조건에 맞는 게임이 없습니다.</div>`;
    return;
  }

  appList.innerHTML = items.map(item => `
    <article class="card">
      <img src="${item.icon}" alt="${escapeHtml(item.title)}" />
      <div class="card-body">
        <h2 class="card-title">${escapeHtml(item.title)}</h2>
        <p class="card-meta">개발사: ${escapeHtml(item.developer || "-")}</p>
        <p class="card-meta">장르: ${escapeHtml(item.genre || "-")}</p>
        <p class="card-meta">출시일: ${formatDate(item.releaseDate)}</p>
      </div>
      <a href="${item.url}" target="_blank" rel="noopener noreferrer">바로가기</a>
    </article>
  `).join("");
}

function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("sortSelect").addEventListener("change", render);

loadApps();
