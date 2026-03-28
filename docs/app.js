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
  return new Date(dateStr).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul'
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function render() {
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const statsEl = document.getElementById("stats");
  const appListEl = document.getElementById("appList");

  const keyword = searchInput.value.trim().toLowerCase();
  const sort = sortSelect.value;

  let items = originalItems.slice();

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

  statsEl.textContent = '총 ' + items.length + '개 게임';

  let html = '';

  items.forEach((item, index) => {
    const appId = item.appId || '';
    const reviewUrl = reviewMap[appId];
    const hasReview = !!reviewUrl;

    const targetUrl = hasReview ? reviewUrl : (item.url || '#');

    html += '<a class="card card-link" href="' + escapeHtml(targetUrl) + '" target="_blank">';

    // 아이콘 + 배지
    html += '<div class="card-thumb">';
    html += '<img src="' + escapeHtml(item.icon || '') + '" />';
    if (hasReview) {
      html += '<span class="thumb-badge">리뷰</span>';
    }
    html += '</div>';

    // 텍스트
    html += '<div class="card-body">';
    html += '<h2>' + escapeHtml(item.title || '-') + '</h2>';
    html += '<p>개발사: ' + escapeHtml(item.developer || '-') + '</p>';
    html += '<p>추천일: ' + formatDate(item.discoveredDate) + '</p>';
    html += '</div>';

    // CTA 버튼
    html += '<div class="card-cta ' + (hasReview ? 'review' : 'store') + '">';
    html += hasReview ? '리뷰 보기' : '구글플레이';
    html += '</div>';

    html += '</a>';

    // 🔥 광고
    if ((index + 1) % 50 === 0) {
      html += `
        <div class="ad-box mid-ad">
          <ins class="adsbygoogle"
            style="display:block"
            data-ad-client="ca-pub-4640178123605595"
            data-ad-slot="3482050864"
            data-ad-format="auto"
            data-full-width-responsive="true"></ins>
        </div>
      `;
    }
  });

  appListEl.innerHTML = html;

  // 광고 실행
  setTimeout(() => {
    if (window.adsbygoogle) {
      document.querySelectorAll('.adsbygoogle').forEach(() => {
        try {
          (adsbygoogle = window.adsbygoogle || []).push({});
        } catch {}
      });
    }
  }, 300);
}

document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("sortSelect").addEventListener("change", render);

loadApps();
