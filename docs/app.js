let originalItems = [];
let reviewMap = {};

async function loadApps() {
  const appListEl = document.getElementById("appList");
  const updatedAtEl = document.getElementById("updatedAt");
  const statsEl = document.getElementById("stats");

  try {
    appListEl.innerHTML = '<div class="empty">데이터 불러오는 중...</div>';

    const appsRes = await fetch('./data/apps.json');
    const data = await appsRes.json();

    try {
      const reviewRes = await fetch('./data/review-map.json');
      reviewMap = await reviewRes.json();
    } catch (e) {
      reviewMap = {};
    }

    originalItems = Array.isArray(data.items) ? data.items : [];

    updatedAtEl.textContent = '마지막 업데이트: ' + formatDateTime(data.updatedAt);
    statsEl.textContent = '총 ' + originalItems.length + '개 게임';

    render();
  } catch (err) {
    console.error(err);
    appListEl.innerHTML = '<div class="empty">데이터를 불러오지 못했습니다.</div>';
  }
}

function formatDate(dateStr) {
  return dateStr || '-';
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';

  const date = new Date(dateStr);

  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function render() {
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  const statsEl = document.getElementById('stats');
  const appListEl = document.getElementById('appList');

  const keyword = searchInput.value.trim().toLowerCase();
  const sort = sortSelect.value;

  let items = originalItems.slice();

  if (keyword) {
    items = items.filter(function (item) {
      return (item.title || '').toLowerCase().includes(keyword) ||
             (item.developer || '').toLowerCase().includes(keyword);
    });
  }

  items.sort(function (a, b) {
    const da = new Date(a.discoveredDate || 0).getTime();
    const db = new Date(b.discoveredDate || 0).getTime();
    return sort === 'desc' ? db - da : da - db;
  });

  statsEl.textContent = '총 ' + items.length + '개 게임';

  if (!items.length) {
    appListEl.innerHTML = '<div class="empty">조건에 맞는 게임이 없습니다.</div>';
    return;
  }

  let html = '';

  items.forEach(function (item) {
    const reviewUrl = reviewMap[item.appId];
    const hasReview = !!reviewUrl;
    const targetUrl = hasReview ? reviewUrl : (item.url || '#');
    const targetLabel = hasReview ? '리뷰 보기' : '구글플레이';

    html += '<a class="card card-link" href="' + escapeHtml(targetUrl) + '" target="_blank" rel="noopener noreferrer">';
    html +=   '<div class="card-thumb">';
    html +=     '<img src="' + escapeHtml(item.icon || '') + '" alt="' + escapeHtml(item.title || '') + '" />';
    if (hasReview) {
      html +=   '<span class="thumb-badge">리뷰</span>';
    }
    html +=   '</div>';

    html +=   '<div class="card-body">';
    html +=     '<h2>' + escapeHtml(item.title || '-') + '</h2>';
    html +=     '<p>개발사: ' + escapeHtml(item.developer || '-') + '</p>';
    html +=     '<p>추천일: ' + escapeHtml(formatDate(item.discoveredDate)) + '</p>';
    html +=   '</div>';

    html +=   '<div class="card-cta">' + targetLabel + '</div>';
    html += '</a>';
  });

  appListEl.innerHTML = html;
}

document.getElementById('searchInput').addEventListener('input', render);
document.getElementById('sortSelect').addEventListener('change', render);

loadApps();
