/**
 * A-Stock Data · 应用逻辑
 */
(function () {
  'use strict';

  var API = window.AStockAPI;
  var CH = window.AStockChart;
  var fmtPct = CH.fmtPct, fmtMoney = CH.fmtMoney;

  var WATCH_KEY = 'astock.watch.v1';
  var state = {
    all: [],
    scanned: 0,
    watch: [],
    current: null,
    klt: 101,
    kline: null,
    timer: null,
    lastScan: 0
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {};

  /* ---------------- 工具 ---------------- */
  function cls(pct) { return pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'; }

  function pctSpan(pct) {
    return '<span class="chip ' + cls(pct) + '">' + fmtPct(pct) + '</span>';
  }

  function toast(msg) {
    var t = el.toast;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  function setStatus(kind, text) {
    el.status.className = 'status ' + kind;
    el.statusText.textContent = text;
  }

  function nowText() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : n; };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* ---------------- 指数 ---------------- */
  var IDX_MKT = { '000001': 1, '000300': 1, '000688': 1, '399001': 0, '399006': 0 };

  function renderIndices(list) {
    var box = el.indices;
    box._data = list;
    if (!box.children.length) {
      box.innerHTML = list.map(function (it, i) {
        return '' +
          '<article class="idx" data-i="' + i + '">' +
            '<div class="nm"><span>' + it.name + '</span><span class="cd">' + it.code + '</span></div>' +
            '<div class="pv mono">—</div>' +
            '<div class="cg"><span class="p">—</span><span class="c">—</span></div>' +
            '<canvas></canvas>' +
          '</article>';
      }).join('');
    }
    list.forEach(function (it, i) {
      var card = box.children[i];
      if (!card) return;
      var c = cls(it.pct);
      card.style.setProperty('--glow', it.pct >= 0 ? 'rgba(255,77,79,.16)' : 'rgba(18,201,140,.15)');
      card.querySelector('.pv').textContent = it.price === null ? '—' : it.price.toFixed(2);
      card.querySelector('.pv').className = 'pv mono ' + c;
      card.querySelector('.p').textContent = fmtPct(it.pct);
      card.querySelector('.p').className = 'p ' + c;
      card.querySelector('.c').textContent = (it.chg > 0 ? '+' : '') + (it.chg === null ? '—' : it.chg.toFixed(2));
      card.querySelector('.c').className = 'c ' + c;
    });
  }

  function loadIndexSparks(list) {
    list.forEach(function (it, i) {
      var mkt = IDX_MKT[it.code];
      if (mkt === undefined) return;
      API.kline(mkt + '.' + it.code, 101, 40).then(function (res) {
        var card = el.indices.children[i];
        if (!card) return;
        var canvas = card.querySelector('canvas');
        CH.sparkline(canvas, res.bars.map(function (b) { return b.close; }), it.pct);
      }).catch(function () {});
    });
  }

  function loadIndices() {
    return API.indices().then(function (list) {
      renderIndices(list);
      if (!el.indices._sparked) {
        el.indices._sparked = true;
        loadIndexSparks(list);
      }
    });
  }

  /* ---------------- 市场宽度 ---------------- */
  function computeBreadth(rows) {
    var buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    var up = 0, down = 0, flat = 0, limitUp = 0, limitDown = 0;
    var amount = 0, pctSum = 0, counted = 0;

    rows.forEach(function (r) {
      var p = r.pct;
      if (p === null || p === undefined) return;
      counted++;
      pctSum += p;
      if (r.amount) amount += r.amount;

      if (p > 0.005) up++; else if (p < -0.005) down++; else flat++;

      var i = p <= -7 ? 0 : p <= -5 ? 1 : p <= -3 ? 2 : p < 0 ? 3 : p === 0 ? 4 :
        p < 3 ? 5 : p < 5 ? 6 : p < 7 ? 7 : 8;
      buckets[i]++;

      var code = r.code;
      var limit = 10;
      if (/^(30|68)/.test(code)) limit = 20;
      else if (/^(4|8)/.test(code)) limit = 30;
      else if (/ST/i.test(r.name || '')) limit = 5;
      if (p >= limit - 0.35) limitUp++;
      if (p <= -(limit - 0.35)) limitDown++;
    });

    return {
      up: up, down: down, flat: flat, buckets: buckets,
      limitUp: limitUp, limitDown: limitDown,
      amount: amount, avg: counted ? pctSum / counted : 0, total: counted
    };
  }

  function renderBreadth(b) {
    el.upCount.textContent = b.up;
    el.downCount.textContent = b.down;
    el.flatCount.textContent = b.flat;
    var total = b.up + b.down + b.flat || 1;
    el.segUp.style.width = (b.up / total * 100) + '%';
    el.segDown.style.width = (b.down / total * 100) + '%';
    el.segFlat.style.width = (b.flat / total * 100) + '%';

    el.limitUp.textContent = b.limitUp;
    el.limitDown.textContent = b.limitDown;
    el.totalAmount.textContent = fmtMoney(b.amount);
    el.avgPct.textContent = fmtPct(b.avg);
    el.avgPct.className = cls(b.avg);
    el.breadthMeta.textContent = '沪深 ' + b.total + ' 只正常交易 · ' + nowText();
    CH.distChart(el.distChart, b.buckets);
  }

  function loadBreadth(force) {
    if (!force && state.all.length && Date.now() - state.lastScan < 180000) {
      renderBreadth(computeBreadth(state.all));
      return Promise.resolve();
    }
    el.scanTip.textContent = '正在扫描全市场行情…';
    return API.scanAll(function (done, pages) {
      el.scanTip.textContent = '扫描中 ' + done + '/' + pages + ' 页';
    }).then(function (rows) {
      state.all = rows;
      state.lastScan = Date.now();
      el.scanTip.textContent = '已加载 ' + rows.length + ' 只个股 · ' + nowText();
      renderBreadth(computeBreadth(rows));
    }).catch(function (e) {
      el.scanTip.textContent = '全市场扫描失败（可稍后手动刷新）';
      throw e;
    });
  }

  /* ---------------- 板块热力图 ---------------- */
  function loadSectors() {
    return API.sectors(64).then(function (res) {
      var items = res.rows.map(function (r) {
        return {
          name: r.name,
          code: r.code,
          pct: r.pct,
          value: Math.max(r.amount || 1, 1e7)
        };
      });
      CH.treemap(el.heatmap, items, function (pick) {
        openStock(pick.code, pick.name, { isSector: true });
      });
    });
  }

  /* ---------------- 榜单 ---------------- */
  function renderTable(table, rows, opts) {
    opts = opts || {};
    var head = '<thead><tr><th>名称</th><th>最新</th><th>涨跌幅</th><th class="col-extra">成交额</th></tr></thead>';
    if (!rows.length) {
      table.innerHTML = head + '<tbody><tr><td colspan="4" style="text-align:center;color:#74839a;padding:18px 0">' +
        (opts.emptyText || '暂无数据') + '</td></tr></tbody>';
      return;
    }
    var body = rows.map(function (r) {
      return '<tr data-code="' + r.code + '" data-name="' + r.name + '">' +
        '<td><span class="nm">' + r.name + '</span><span class="cd">' + r.code + '</span></td>' +
        '<td>' + (r.price === null ? '—' : r.price.toFixed(2)) + '</td>' +
        '<td class="pct ' + cls(r.pct) + '">' + fmtPct(r.pct) + '</td>' +
        '<td class="col-extra" style="color:#9dabbd">' + fmtMoney(r.amount) + '</td>' +
        '</tr>';
    }).join('');
    table.innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  function bindRowOpen(table) {
    table.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-code]');
      if (!tr) return;
      openStock(tr.dataset.code, tr.dataset.name);
    });
  }

  function loadRanks() {
    return Promise.all([
      API.rank('desc', 15).catch(function () { return { rows: [] }; }),
      API.rank('asc', 15).catch(function () { return { rows: [] }; })
    ]).then(function (res) {
      renderTable(el.gainersTable, res[0].rows);
      renderTable(el.losersTable, res[1].rows);
    });
  }

  /* ---------------- 自选股 ---------------- */
  function loadWatch() {
    try {
      var raw = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
      state.watch = Array.isArray(raw) ? raw : [];
    } catch (e) { state.watch = []; }
  }

  function saveWatch() {
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(state.watch)); } catch (e) {}
  }

  function inWatch(code) {
    return state.watch.some(function (w) { return w.code === code; });
  }

  function renderWatch(rows) {
    if (!state.watch.length) {
      el.watchTable.innerHTML = '';
      el.watchEmpty.classList.remove('hide');
      return;
    }
    el.watchEmpty.classList.add('hide');
    var data = rows || state.watch.map(function (w) {
      return { code: w.code, name: w.name, price: null, pct: null, amount: null };
    });
    renderTable(el.watchTable, data, { emptyText: '暂无行情' });
  }

  function refreshWatch() {
    if (!state.watch.length) { renderWatch([]); return; }
    API.quotes(state.watch.map(function (w) { return w.code; }))
      .then(function (rows) {
        // 保证顺序与自选一致，缺失的补占位
        var map = {};
        rows.forEach(function (r) { map[r.code] = r; });
        var out = state.watch.map(function (w) {
          return map[w.code] || { code: w.code, name: w.name, price: null, pct: null, amount: null };
        });
        renderWatch(out);
      })
      .catch(function () { renderWatch([]); });
  }

  function toggleWatch(code, name) {
    var i = state.watch.findIndex(function (w) { return w.code === code; });
    if (i >= 0) {
      state.watch.splice(i, 1);
      toast('已移出自选');
    } else {
      state.watch.unshift({ code: code, name: name });
      toast('已加入自选 · ' + name);
    }
    saveWatch();
    renderWatch();
    refreshWatch();
    syncWatchBtn();
  }

  function syncWatchBtn() {
    if (!state.current) return;
    var on = inWatch(state.current.code);
    el.watchBtn.textContent = on ? '★ 已自选' : '＋ 自选';
    el.watchBtn.classList.toggle('on', on);
  }

  /* ---------------- 个股详情 ---------------- */
  var klineChart = null;

  function openStock(code, name, opts) {
    opts = opts || {};
    var mode = opts.mode || (opts.isSector ? 'sector' : 'stock');
    state.current = {
      code: code,
      name: name,
      mode: mode,
      secid: opts.secid || (mode === 'sector' ? '90.' + code : '')
    };
    el.dName.textContent = name || code;
    el.dCode.textContent = code;
    el.dPrice.textContent = '—';
    el.dChg.textContent = '';
    el.dStats.innerHTML = '';
    el.dFoot.textContent = '加载中…';
    el.watchBtn.style.display = mode === 'stock' ? '' : 'none';
    el.drawer.classList.add('on');
    el.drawerMask.classList.add('on');
    el.drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    syncWatchBtn();

    if (!klineChart) klineChart = new CH.KLine(el.klineCanvas, el.kTip);
    loadKline();

    if (mode === 'stock') {
      API.quotes([code]).then(function (rows) {
        if (!rows.length || !state.current || state.current.code !== code) return;
        renderStockStats(rows[0]);
      }).catch(function () {});
    } else {
      el.dFoot.textContent = mode === 'index' ? '指数日线走势 · 可切换周/月K' : '板块指数走势 · 可切换周/月K';
    }
  }

  function renderStockStats(r) {
    var c = cls(r.pct);
    el.dName.textContent = r.name || state.current.name;
    el.dPrice.textContent = r.price === null ? '—' : r.price.toFixed(2);
    el.dPrice.className = c;
    el.dChg.textContent = fmtPct(r.pct) + '　' + (r.chg > 0 ? '+' : '') + (r.chg === null ? '' : r.chg.toFixed(2));
    el.dChg.className = c;

    var cells = [
      ['今开', r.open], ['昨收', r.preClose], ['最高', r.high], ['最低', r.low],
      ['成交额', fmtMoney(r.amount)], ['换手率', r.turnover === null ? '—' : r.turnover.toFixed(2) + '%'],
      ['振幅', r.amp === null ? '—' : r.amp.toFixed(2) + '%'], ['量比', r.volRatio === null ? '—' : r.volRatio.toFixed(2)],
      ['市盈率(动)', r.pe === null ? '—' : r.pe.toFixed(2)], ['市净率', r.pb === null ? '—' : r.pb.toFixed(2)],
      ['总市值', fmtMoney(r.mcap)], ['流通市值', fmtMoney(r.fcap)]
    ];
    el.dStats.innerHTML = cells.map(function (x) {
      return '<div><span>' + x[0] + '</span><b>' + (x[1] === null || x[1] === undefined || x[1] === '' ? '—' : x[1]) + '</b></div>';
    }).join('');
    el.dFoot.textContent = '数据来自东方财富公开行情接口 · 更新于 ' + nowText() + ' · 仅供参考';
  }

  function loadKline() {
    if (!state.current) return;
    var cur = state.current;
    var secid = cur.secid || (cur.mode === 'sector' ? '90.' + cur.code : API.secidOf(cur.code));
    el.dFoot.textContent = '加载 K 线…';
    API.kline(secid, state.klt, 140).then(function (res) {
      if (!state.current || state.current.code !== cur.code) return;
      if (!res.bars.length) { el.dFoot.textContent = '该标的暂无 K 线数据'; return; }
      klineChart.setData(res.bars);
      var last = res.bars[res.bars.length - 1];
      el.dFoot.textContent = '共 ' + res.total + ' 根K线 · 最新 ' + last.date + ' · 数据来自东方财富，不构成投资建议';
    }).catch(function () {
      el.dFoot.textContent = 'K 线加载失败，请稍后重试';
    });
  }

  function closeDrawer() {
    el.drawer.classList.remove('on');
    el.drawerMask.classList.remove('on');
    el.drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.current = null;
  }

  /* ---------------- 搜索 ---------------- */
  function searchRows(kw) {
    kw = kw.trim().toLowerCase();
    if (!kw) return [];
    var out = [];
    for (var i = 0; i < state.all.length && out.length < 8; i++) {
      var r = state.all[i];
      if (r.code.indexOf(kw) === 0 || (r.name && r.name.toLowerCase().indexOf(kw) >= 0)) out.push(r);
    }
    return out;
  }

  function renderSearchDrop(list) {
    if (!list.length) {
      el.searchDrop.innerHTML = state.all.length
        ? '<button disabled style="color:#74839a;cursor:default">无匹配结果</button>'
        : '<button disabled style="color:#74839a;cursor:default">全市场数据加载中…</button>';
      el.searchDrop.classList.add('on');
      return;
    }
    el.searchDrop.innerHTML = list.map(function (r) {
      return '<button data-code="' + r.code + '" data-name="' + r.name + '">' +
        '<span>' + r.name + '</span><span class="c">' + r.code + '</span>' +
        '<span class="p ' + cls(r.pct) + '">' + fmtPct(r.pct) + '</span></button>';
    }).join('');
    el.searchDrop.classList.add('on');
  }

  /* ---------------- 事件 ---------------- */
  function bindEvents() {
    el.refreshBtn.addEventListener('click', function () {
      el.refreshBtn.classList.add('spin');
      refreshAll(true).then(function () {
        el.refreshBtn.classList.remove('spin');
        toast('已刷新 · ' + nowText());
      });
    });

    el.autoRefresh.addEventListener('change', function () {
      if (this.checked) startTimer(); else stopTimer();
    });

    el.closeDrawer.addEventListener('click', closeDrawer);
    el.drawerMask.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });

    el.watchBtn.addEventListener('click', function () {
      if (state.current) toggleWatch(state.current.code, state.current.name);
    });

    el.clearWatch.addEventListener('click', function () {
      if (!state.watch.length) return;
      if (!confirm('确定清空自选股？')) return;
      state.watch = [];
      saveWatch();
      renderWatch();
      syncWatchBtn();
      toast('自选已清空');
    });

    el.kltSegs.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-klt]');
      if (!btn) return;
      Array.prototype.forEach.call(el.kltSegs.children, function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      state.klt = Number(btn.dataset.klt);
      loadKline();
    });

    el.searchInput.addEventListener('input', function () {
      var kw = this.value;
      if (!kw.trim()) { el.searchDrop.classList.remove('on'); return; }
      renderSearchDrop(searchRows(kw));
    });

    el.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var kw = this.value.trim();
        if (!kw) return;
        if (/^\d{6}$/.test(kw)) {
          var hit = state.all.find(function (r) { return r.code === kw; });
          openStock(kw, hit ? hit.name : kw);
        } else {
          var res = searchRows(kw);
          if (res.length) openStock(res[0].code, res[0].name);
        }
        el.searchDrop.classList.remove('on');
        this.blur();
      } else if (e.key === 'Escape') {
        el.searchDrop.classList.remove('on');
      }
    });

    el.searchDrop.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-code]');
      if (!b) return;
      openStock(b.dataset.code, b.dataset.name);
      el.searchDrop.classList.remove('on');
      el.searchInput.value = '';
    });

    document.addEventListener('click', function (e) {
      if (!el.search.contains(e.target)) el.searchDrop.classList.remove('on');
    });

    bindRowOpen(el.gainersTable);
    bindRowOpen(el.losersTable);
    bindRowOpen(el.watchTable);

    el.indices.addEventListener('click', function (e) {
      var card = e.target.closest('article.idx');
      if (!card) return;
      var it = (el.indices._data || [])[Number(card.dataset.i)];
      if (!it) return;
      var mkt = IDX_MKT[it.code];
      openStock(it.code, it.name, {
        mode: 'index',
        secid: (mkt === undefined ? 1 : mkt) + '.' + it.code
      });
    });

    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        loadSectors();
        if (klineChart) klineChart.draw();
        var b = computeBreadth(state.all);
        if (state.all.length) CH.distChart(el.distChart, b.buckets);
      }, 220);
    });
  }

  /* ---------------- 生命周期 ---------------- */
  function startTimer() {
    stopTimer();
    state.timer = setInterval(function () {
      if (document.hidden) return;
      refreshAll(false);
    }, 30000);
  }
  function stopTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function refreshAll(force) {
    return Promise.all([
      loadIndices().catch(function () {}),
      loadRanks().catch(function () {}),
      loadBreadth(force).catch(function () {}),
      loadSectors().catch(function () {})
    ]).then(function () {
      refreshWatch();
      setStatus('ok', '实时 · ' + nowText());
    });
  }

  function boot() {
    el = {
      indices: $('indices'),
      status: $('status'),
      statusText: $('statusText'),
      refreshBtn: $('refreshBtn'),
      autoRefresh: $('autoRefresh'),
      search: document.querySelector('.search'),
      searchInput: $('searchInput'),
      searchDrop: $('searchDrop'),
      upCount: $('upCount'), downCount: $('downCount'), flatCount: $('flatCount'),
      segUp: $('segUp'), segDown: $('segDown'), segFlat: $('segFlat'),
      limitUp: $('limitUp'), limitDown: $('limitDown'),
      totalAmount: $('totalAmount'), avgPct: $('avgPct'),
      breadthMeta: $('breadthMeta'),
      distChart: $('distChart'),
      scanTip: $('scanTip'),
      heatmap: $('heatmap'),
      gainersTable: $('gainersTable'),
      losersTable: $('losersTable'),
      watchTable: $('watchTable'),
      watchEmpty: $('watchEmpty'),
      clearWatch: $('clearWatch'),
      drawer: $('drawer'), drawerMask: $('drawerMask'),
      dName: $('dName'), dCode: $('dCode'), dPrice: $('dPrice'), dChg: $('dChg'),
      dStats: $('dStats'), dFoot: $('dFoot'),
      klineCanvas: $('klineCanvas'), kTip: $('kTip'),
      kltSegs: $('kltSegs'), closeDrawer: $('closeDrawer'), watchBtn: $('watchBtn'),
      toast: $('toast')
    };

    loadWatch();
    renderWatch();
    bindEvents();
    refreshAll(true);
    startTimer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
