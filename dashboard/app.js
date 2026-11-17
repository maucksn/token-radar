// Token Radar dashboard — vanilla JS, no network. Reads window.RADAR from data.js
// (written beside dashboard/ by main.ts) and renders the ranked board, filters,
// sorting, a live-token tab, and a per-protocol detail view with the model
// breakdown and the farm plan.
(function () {
  'use strict';

  var D = window.RADAR;
  var note = document.getElementById('noresults');
  if (!D || !D.rows) {
    if (note) { note.hidden = false; note.textContent = 'No radar data found. data.js did not load or is empty.'; }
    return;
  }

  var state = { q: '', chain: 'all', category: 'all', top40: false, tab: 'pre', sort: 'implied', dir: -1 };

  /* ---------- formatting ---------- */
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(3) + 'x';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function chainChips(chains) {
    if (!chains || !chains.length) return '<span class="na">—</span>';
    var shown = chains.slice(0, 3);
    var extra = chains.length - shown.length;
    var html = shown.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('');
    if (extra > 0) html += '<span class="chip more">+' + extra + '</span>';
    return html;
  }

  /* ---------- header stats + model text ---------- */
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  setText('stat-asof', D.as_of || '—');
  setText('stat-board', String(D.board_size || D.rows.length));
  setText('stat-farmable', String(D.farmable_size || D.rows.length));
  setText('stat-live', String(D.live_size || (D.live || []).length));
  setText('stat-model', D.model_version || '—');

  var m = D.model || {};
  var modelText = document.getElementById('model-text');
  if (modelText) {
    var g = 'Growth multiplier = 1 + clamp(7d change, ' + m.growth_floor + '%, ' + m.growth_cap + '%) / 100 x ' + m.growth_weight + '. ';
    var mat = 'Maturity multiplier = ' + m.maturity_floor + ' + min(age, ' + m.maturity_days + 'd) / ' + m.maturity_days + 'd x ' + m.maturity_range + '; unknown age counts as ' + m.unknown_age_days + ' days. ';
    var cat = 'Each category carries its own multiple (global multiple ' + (D.global_multiple !== undefined ? D.global_multiple : 'n/a') + '), estimated from the live-token protocols in that category. ';
    modelText.innerHTML =
      '<span class="formula">implied value = TVL x category multiple x growth multiplier x maturity multiplier</span><br>' +
      esc(g + mat + cat) +
      'Multiples are floored at ' + m.multiple_floor + ' and capped at ' + m.multiple_cap + '; a category needs at least ' + m.multiple_min_samples + ' live samples before its own multiple is trusted.';
  }

  /* ---------- filter options ---------- */
  function uniqSorted(list) {
    var seen = {}, out = [];
    list.forEach(function (v) { if (v !== null && v !== undefined && v !== '' && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out.sort();
  }
  var allChains = uniqSorted(D.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []));
  var allCats = uniqSorted(D.rows.map(function (r) { return r.category || 'Other'; })
    .concat((D.live || []).map(function (r) { return r.category || 'Other'; })));

  function fillSelect(id, values, allLabel) {
    var sel = document.getElementById(id);
    sel.innerHTML = '<option value="all">' + esc(allLabel) + '</option>' +
      values.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
  }
  fillSelect('chain', allChains, 'All chains');
  fillSelect('category', allCats, 'All categories');

  /* ---------- filtering + sorting ---------- */
  function matches(r) {
    if (state.top40 && r.rank !== undefined && r.rank > 40) return false;
    if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
    if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
    if (state.q) {
      var hay = ((r.name || '') + ' ' + (r.slug || '') + ' ' + (r.category || '')).toLowerCase();
      if (hay.indexOf(state.q) < 0) return false;
    }
    return true;
  }
  function valOf(r, key) {
    if (key === 'rank') return r.rank === undefined ? Infinity : r.rank;
    if (key === 'name') return (r.name || '').toLowerCase();
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'change') return r.change_7d;
    if (key === 'implied') return r.implied_value_usd;
    if (key === 'age') return r.age_days;
    return r.implied_value_usd;
  }
  function sortList(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av = valOf(a, key), bv = valOf(b, key);
      var an = (av === null || av === undefined), bn = (bv === null || bv === undefined);
      if (an && bn) return (a.slug || '') < (b.slug || '') ? -1 : 1;
      if (an) return 1;   // nulls always last
      if (bn) return -1;
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return (a.slug || '') < (b.slug || '') ? -1 : 1;
    });
  }

  /* ---------- board rendering ---------- */
  var tbody = document.getElementById('rows');
  var countEl = document.getElementById('count');

  function rowHtml(r) {
    var chg = r.change_7d === null || r.change_7d === undefined
      ? '<span class="na">n/a</span>'
      : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</span>';
    var top = r.rank !== undefined && r.rank <= 10 ? ' top' : '';
    return '<tr data-slug="' + esc(r.slug) + '" tabindex="0">' +
      '<td class="rank' + top + '">' + (r.rank !== undefined ? r.rank : '—') + '</td>' +
      '<td><span class="pname">' + esc(r.name) + '</span><span class="pslug">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || 'Other') + '</td>' +
      '<td>' + chainChips(r.chains) + '</td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num">' + chg + '</td>' +
      '<td class="num implied">' + fmtUsd(r.implied_value_usd) + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '</tr>';
  }
  function liveRowHtml(r) {
    var chg = r.change_7d === null || r.change_7d === undefined
      ? '<span class="na">n/a</span>'
      : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</span>';
    return '<tr>' +
      '<td><span class="pname">' + esc(r.name) + '</span><span class="pslug">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || 'Other') + '</td>' +
      '<td>' + chainChips(r.chains) + '</td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num">' + chg + '</td>' +
      '<td class="num implied">' + fmtUsd(r.mcap_usd) + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '</tr>';
  }

  function updateArrows() {
    document.querySelectorAll('#board [data-arrow]').forEach(function (el) {
      el.textContent = el.getAttribute('data-arrow') === state.sort ? (state.dir < 0 ? '▼' : '▲') : '';
    });
  }

  function render() {
    updateArrows();
    if (state.tab === 'live') {
      var live = sortList((D.live || []).filter(matches));
      tbody.innerHTML = live.length ? live.map(liveRowHtml).join('')
        : '<tr><td colspan="8"><div class="empty"><b>No live token matches that filter</b>Clear the search or pick another chain or category.</div></td></tr>';
      countEl.textContent = 'Showing ' + live.length + ' of ' + (D.live || []).length + ' live-token protocols';
      return;
    }
    var list = sortList(D.rows.filter(matches));
    tbody.innerHTML = list.length ? list.map(rowHtml).join('')
      : '<tr><td colspan="8"><div class="empty"><b>No protocol matches that filter</b>Clear the search or pick another chain or category.</div></td></tr>';
    countEl.textContent = 'Showing ' + list.length + ' of ' + D.rows.length + ' pre-token protocols' +
      (state.top40 ? ' (Top 40 only)' : '');
  }

  /* ---------- controls ---------- */
  document.getElementById('q').addEventListener('input', function (e) {
    state.q = e.target.value.trim().toLowerCase();
    render();
  });
  document.getElementById('chain').addEventListener('change', function (e) {
    state.chain = e.target.value;
    render();
  });
  document.getElementById('category').addEventListener('change', function (e) {
    state.category = e.target.value;
    render();
  });
  document.getElementById('top40').addEventListener('change', function (e) {
    state.top40 = e.target.checked;
    render();
  });
  document.querySelectorAll('#board thead button[data-sort]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = (key === 'name' || key === 'rank') ? 1 : -1; }
      render();
    });
  });

  var tabPre = document.getElementById('tab-pre');
  var tabLive = document.getElementById('tab-live');
  function setTab(tab) {
    state.tab = tab;
    tabPre.setAttribute('aria-selected', tab === 'pre' ? 'true' : 'false');
    tabLive.setAttribute('aria-selected', tab === 'live' ? 'true' : 'false');
    // Live table reuses the same columns; relabel the last value column.
    var impliedTh = document.querySelector('#board thead button[data-sort="implied"]');
    if (impliedTh) impliedTh.firstChild.textContent = tab === 'live' ? 'Market cap ' : 'Implied value ';
    render();
  }
  tabPre.addEventListener('click', function () { setTab('pre'); });
  tabLive.addEventListener('click', function () { setTab('live'); });

  /* ---------- detail view ---------- */
  var dialog = document.getElementById('detail');
  function bySlug(slug) {
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) return D.rows[i];
    return null;
  }
  function openDetail(slug) {
    var r = bySlug(slug);
    if (!r) return;
    document.getElementById('detail-kicker').textContent = 'Rank ' + r.rank + ' of ' + D.rows.length + ' · Pre-token · Farmable';
    document.getElementById('detail-title').textContent = r.name;
    document.getElementById('detail-sub').textContent =
      (r.category || 'Other') + ' on ' + ((r.chains || []).join(', ') || 'an unnamed chain') +
      ' · TVL ' + fmtUsd(r.tvl_usd) + ' · 7d ' + fmtPct(r.change_7d) +
      ' · Age ' + fmtAge(r.age_days) +
      (r.listed_at ? ' · Listed ' + r.listed_at : '');

    var recomputed = Math.round(r.tvl_usd * r.category_multiple * r.growth_multiplier * r.maturity_multiplier);
    var rows = [
      ['TVL', fmtUsd(r.tvl_usd)],
      ['Category multiple (' + (r.category || 'Other') + ')', fmtMult(r.category_multiple)],
      ['Growth multiplier (7d ' + fmtPct(r.change_7d) + ')', fmtMult(r.growth_multiplier)],
      ['Maturity multiplier (' + fmtAge(r.age_days) + ' with no token)', fmtMult(r.maturity_multiplier)],
      ['Farmability', (r.farmability !== undefined ? r.farmability : 1) + 'x']
    ];
    var html = rows.map(function (kv) {
      return '<tr><td>' + esc(kv[0]) + '</td><td>' + esc(kv[1]) + '</td></tr>';
    }).join('');
    html += '<tr class="total"><td>Implied value</td><td>' + fmtUsd(r.implied_value_usd) + '</td></tr>';
    document.getElementById('detail-breakdown').innerHTML = html;
    document.getElementById('detail-check').textContent =
      'Recomputed from the same inputs: ' + fmtUsd(recomputed) +
      (recomputed === r.implied_value_usd ? ' — matches the board figure.' : ' — differs from the board figure (' + fmtUsd(r.implied_value_usd) + '); the snapshot and the board disagree.') +
      ' Model ' + (D.model_version || '') + '.';

    var steps = r.farm_steps || [];
    document.getElementById('detail-steps').innerHTML = steps.length
      ? steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('')
      : '<li>No farm plan recorded for this protocol.</li>';

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }
  function closeDetail() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDetail(); });

  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  tbody.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var tr = e.target.closest('tr[data-slug]');
    if (tr) { e.preventDefault(); openDetail(tr.getAttribute('data-slug')); }
  });

  /* ---------- deep links (also used to capture the three screenshots) ---------- */
  try {
    var params = new URLSearchParams(window.location.search);
    var q0 = params.get('q');
    if (q0) { state.q = q0.trim().toLowerCase(); document.getElementById('q').value = q0; }
    var chain0 = params.get('chain');
    if (chain0) { state.chain = chain0; document.getElementById('chain').value = chain0; }
    var cat0 = params.get('category');
    if (cat0) { state.category = cat0; document.getElementById('category').value = cat0; }
    var top0 = params.get('top40');
    if (top0 === '1') { state.top40 = true; document.getElementById('top40').checked = true; }
    render();
    var detail0 = params.get('detail');
    if (detail0) openDetail(detail0);
  } catch (err) {
    render();
  }
})();
