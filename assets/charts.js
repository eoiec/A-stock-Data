/**
 * A-Stock Data · 图表层（纯 Canvas / DOM，无第三方库）
 */
(function (global) {
  'use strict';

  var UP = '#ff4d4f';
  var DOWN = '#12c98c';
  var GRID = 'rgba(255,255,255,.055)';
  var TXT = '#74839a';

  function dpr() { return Math.min(global.devicePixelRatio || 1, 2); }

  function fit(canvas) {
    var w = canvas.clientWidth || canvas.parentNode.clientWidth;
    var h = canvas.clientHeight || parseInt(canvas.getAttribute('height'), 10) || 150;
    var ratio = dpr();
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function cssColor(pct) {
    if (pct === null || pct === undefined) return TXT;
    if (pct > 0.001) return UP;
    if (pct < -0.001) return DOWN;
    return TXT;
  }

  /* ================= 迷你走势 ================= */
  function sparkline(canvas, values, pct) {
    var f = fit(canvas);
    var ctx = f.ctx, w = f.w, h = f.h;
    ctx.clearRect(0, 0, w, h);
    if (!values || values.length < 2) return;

    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = max - min || 1;
    var pad = 3;
    var stepX = w / (values.length - 1);
    var color = cssColor(pct);

    function x(i) { return i * stepX; }
    function y(v) { return h - pad - ((v - min) / span) * (h - pad * 2); }

    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color === UP ? 'rgba(255,77,79,.34)' : color === DOWN ? 'rgba(18,201,140,.3)' : 'rgba(140,160,180,.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (var i = 0; i < values.length; i++) ctx.lineTo(x(i), y(values[i]));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x(0), y(values[0]));
    for (var j = 1; j < values.length; j++) ctx.lineTo(x(j), y(values[j]));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x(values.length - 1), y(values[values.length - 1]), 2.1, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /* ================= 涨跌幅分布 ================= */
  var BUCKETS = ['≤-7', '-7~-5', '-5~-3', '-3~0', '0', '0~3', '3~5', '5~7', '≥7'];

  function distChart(canvas, counts) {
    var f = fit(canvas);
    var ctx = f.ctx, w = f.w, h = f.h;
    ctx.clearRect(0, 0, w, h);
    if (!counts || !counts.length) return;

    var max = Math.max.apply(null, counts) || 1;
    var top = 20, bottom = 22;
    var plotH = h - top - bottom;
    var slot = w / counts.length;
    var bw = Math.min(slot * 0.62, 46);

    for (var g = 0; g <= 3; g++) {
      var gy = top + (plotH / 3) * g;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    counts.forEach(function (c, i) {
      var cx = slot * i + slot / 2;
      var bh = Math.max(2, (c / max) * plotH);
      var y = top + plotH - bh;
      var idx = i - 4; // -4..4
      var color = idx < 0 ? DOWN : idx > 0 ? UP : '#4a5668';
      var alpha = 0.42 + 0.58 * (Math.abs(idx) / 4);

      var grad = ctx.createLinearGradient(0, y, 0, top + plotH);
      grad.addColorStop(0, hexA(color, alpha));
      grad.addColorStop(1, hexA(color, alpha * 0.28));

      ctx.beginPath();
      var r = Math.min(4, bw / 2);
      roundRect(ctx, cx - bw / 2, y, bw, bh, r, r, 0, 0);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.fillStyle = '#9dabbd';
      ctx.font = '500 10px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(c), cx, y - 5 < 10 ? 11 : y - 5);

      ctx.fillStyle = TXT;
      ctx.font = '400 10px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText(BUCKETS[i], cx, h - 6);
    });
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function roundRect(ctx, x, y, w, h, tl, tr, br, bl) {
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    ctx.lineTo(x + bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    ctx.lineTo(x, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
  }

  /* ================= 板块热力图 ================= */
  function heatColor(pct) {
    var t = Math.max(-1, Math.min(1, (pct || 0) / 5));
    var k = Math.pow(Math.abs(t), 0.72);
    var base = [26, 35, 47];
    var target = t >= 0 ? [226, 62, 66] : [14, 158, 116];
    var c = base.map(function (b, i) { return Math.round(b + (target[i] - b) * k); });
    return 'rgb(' + c.join(',') + ')';
  }

  /** 窄屏用：按成交额排序的条形热力列表，名称完整显示 */
  function renderHeatList(container, items, onPick) {
    var data = items
      .filter(function (d) { return d.value > 0; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 12);

    var max = data.length ? data[0].value : 1;
    var frag = document.createDocumentFragment();

    data.forEach(function (d) {
      var row = document.createElement('div');
      row.className = 'hl-row' + (d.code ? ' clickable' : '');
      var w = Math.max(6, Math.round((d.value / max) * 100));
      var up = (d.pct || 0) > 0;
      row.innerHTML =
        '<span class="hl-name">' + d.name + '</span>' +
        '<span class="hl-bar"><i style="width:' + w + '%;background:' + heatColor(d.pct) + '"></i></span>' +
        '<span class="hl-pct ' + (up ? 'up' : ((d.pct || 0) < 0 ? 'down' : 'flat')) + '">' + fmtPct(d.pct) + '</span>';
      if (d.code && onPick) {
        row.addEventListener('click', function () {
          onPick({ code: d.code, name: d.name, isSector: true });
        });
      }
      frag.appendChild(row);
    });
    container.appendChild(frag);
  }

  function layoutTree(items, x, y, w, h, out) {
    if (!items.length) return;
    if (items.length === 1) {
      out.push({ item: items[0], x: x, y: y, w: w, h: h });
      return;
    }
    var total = items.reduce(function (s, i) { return s + i.value; }, 0) || 1;
    var acc = 0, split = 1;
    for (var i = 0; i < items.length - 1; i++) {
      acc += items[i].value;
      split = i + 1;
      if (acc >= total / 2) break;
    }
    var a = items.slice(0, split), b = items.slice(split);
    var ra = a.reduce(function (s, i) { return s + i.value; }, 0) / total;
    if (w >= h) {
      layoutTree(a, x, y, w * ra, h, out);
      layoutTree(b, x + w * ra, y, w * (1 - ra), h, out);
    } else {
      layoutTree(a, x, y, w, h * ra, out);
      layoutTree(b, x, y + h * ra, w, h * (1 - ra), out);
    }
  }

  function treemap(container, items, onPick) {
    container.innerHTML = '';
    if (!items || !items.length) return;
    var w = container.clientWidth;
    var h = container.clientHeight;
    if (!w || !h) return;

    // 窄屏（手机）改用条形列表：名称完整可读，避免 treemap 格子文字被挤压
    if (w < 470) {
      container.classList.add('list-mode');
      renderHeatList(container, items, onPick);
      return;
    }
    container.classList.remove('list-mode');

    var data = items
      .filter(function (d) { return d.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });

    // 控制碎片数量：只保留前 N 大，其余合并（窄屏减少格子数，避免文字挤成一团）
    var maxCells = w < 480 ? 12 : (w < 720 ? 26 : 44);
    if (data.length > maxCells) {
      var rest = data.slice(maxCells - 1);
      data = data.slice(0, maxCells - 1).concat([{
        name: '其他 ' + rest.length,
        pct: rest.reduce(function (s, d) { return s + (d.pct || 0); }, 0) / rest.length,
        value: rest.reduce(function (s, d) { return s + d.value; }, 0),
        merged: true
      }]);
    }

    var boxes = [];
    layoutTree(data, 0, 0, w, h, boxes);

    var frag = document.createDocumentFragment();
    boxes.forEach(function (b) {
      var gap = 2;
      var cls = 'heat-cell';
      if (b.w < 74 || b.h < 36) cls += ' sm';
      if (b.w < 40 || b.h < 22) cls += ' xs';
      var el = document.createElement('div');
      el.className = cls;
      el.style.left = (b.x + gap / 2) + 'px';
      el.style.top = (b.y + gap / 2) + 'px';
      el.style.width = Math.max(0, b.w - gap) + 'px';
      el.style.height = Math.max(0, b.h - gap) + 'px';
      el.style.background = heatColor(b.item.pct);
      el.title = b.item.name + ' ' + fmtPct(b.item.pct) + (b.item.amount ? ' · 成交额 ' + fmtMoney(b.item.amount) : '');
      el.innerHTML = '<span class="hn">' + b.item.name + '</span>' +
        '<span class="hp">' + fmtPct(b.item.pct) + '</span>';
      if (b.item.code) {
        el.addEventListener('click', function () {
          if (onPick) onPick({ code: b.item.code, name: b.item.name, isSector: true });
        });
      }
      frag.appendChild(el);
    });
    container.appendChild(frag);
  }

  /* ================= K 线 ================= */
  function ma(bars, n) {
    var out = [], sum = 0;
    for (var i = 0; i < bars.length; i++) {
      sum += bars[i].close;
      if (i >= n) sum -= bars[i - n].close;
      out.push(i >= n - 1 ? sum / n : null);
    }
    return out;
  }

  function KLine(canvas, tipEl) {
    this.canvas = canvas;
    this.tip = tipEl;
    this.bars = [];
    this.ma5 = [];
    this.ma10 = [];
    this.ma20 = [];
    this.hover = -1;
    this.visible = 120;
    var self = this;

    canvas.addEventListener('mousemove', function (e) {
      var f = self._geom();
      if (!f) return;
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var idx = Math.round((mx - f.padL) / f.step - 0.5) + f.start;
      idx = Math.max(f.start, Math.min(self.bars.length - 1, idx));
      self.hover = idx;
      self.draw();
      self._tipAt(e.clientX - rect.left, e.clientY - rect.top);
    });
    canvas.addEventListener('mouseleave', function () {
      self.hover = -1;
      self.draw();
      if (self.tip) self.tip.classList.remove('on');
    });
  }

  KLine.prototype.setData = function (bars) {
    this.bars = bars || [];
    this.ma5 = ma(this.bars, 5);
    this.ma10 = ma(this.bars, 10);
    this.ma20 = ma(this.bars, 20);
    this.hover = -1;
    this.draw();
  };

  KLine.prototype._geom = function () {
    var n = this.bars.length;
    if (!n) return null;
    var cw = this.canvas.clientWidth;
    var ch = this.canvas.clientHeight;
    var padL = 6, padR = 54, padT = 12, padB = 20;
    var volH = Math.round(ch * 0.19);
    var priceH = ch - padT - padB - volH - 14;
    var count = Math.min(n, this.visible);
    var start = n - count;
    var plotW = cw - padL - padR;
    var step = plotW / count;
    return { cw: cw, ch: ch, padL: padL, padR: padR, padT: padT, padB: padB, volH: volH, priceH: priceH, start: start, count: count, step: step, plotW: plotW };
  };

  KLine.prototype.draw = function () {
    var f = this._geom();
    if (!f) return;
    var c = fit(this.canvas);
    var ctx = c.ctx;
    ctx.clearRect(0, 0, f.cw, f.ch);
    if (!this.bars.length) return;

    var bars = this.bars;
    var s = f.start, cnt = f.count;

    var hi = -Infinity, lo = Infinity;
    for (var i = s; i < s + cnt; i++) {
      hi = Math.max(hi, bars[i].high);
      lo = Math.min(lo, bars[i].low);
      if (this.ma20[i] !== null) { hi = Math.max(hi, this.ma20[i]); lo = Math.min(lo, this.ma20[i]); }
    }
    var span = hi - lo || 1;
    hi += span * 0.06;
    lo -= span * 0.06;
    span = hi - lo;

    var self = this;
    function px(i) { return f.padL + (i - s + 0.5) * f.step; }
    function py(v) { return f.padT + (hi - v) / span * f.priceH; }

    // 网格 + 价格刻度
    ctx.font = '400 10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    for (var g = 0; g <= 4; g++) {
      var y = f.padT + (f.priceH / 4) * g;
      ctx.beginPath();
      ctx.moveTo(f.padL, y);
      ctx.lineTo(f.cw - f.padR, y);
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.stroke();
      var val = hi - (span / 4) * g;
      ctx.fillStyle = TXT;
      ctx.fillText(val.toFixed(val > 1000 ? 0 : 2), f.cw - f.padR + 6, y + 3);
    }

    // 日期轴
    var ticks = 4;
    ctx.textAlign = 'center';
    for (var t = 0; t <= ticks; t++) {
      var idx = s + Math.round((cnt - 1) * t / ticks);
      var lbl = bars[idx].date.slice(5);
      ctx.fillStyle = TXT;
      ctx.fillText(lbl, Math.min(f.cw - f.padR - 16, Math.max(f.padL + 16, px(idx))), f.ch - 6);
    }

    // 成交量区
    var volTop = f.padT + f.priceH + 14;
    var maxVol = 0;
    for (var v = s; v < s + cnt; v++) maxVol = Math.max(maxVol, bars[v].vol);
    maxVol = maxVol || 1;

    var bodyW = Math.max(1, f.step * 0.62);

    for (var k = s; k < s + cnt; k++) {
      var b = bars[k];
      var up = b.close >= b.open;
      var color = up ? UP : DOWN;
      var x = px(k);

      // 影线
      ctx.beginPath();
      ctx.moveTo(x, py(b.high));
      ctx.lineTo(x, py(b.low));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();

      // 实体
      var yo = py(b.open), yc = py(b.close);
      var top = Math.min(yo, yc);
      var hgt = Math.max(1, Math.abs(yc - yo));
      ctx.fillStyle = color;
      ctx.fillRect(x - bodyW / 2, top, bodyW, hgt);

      // 量柱
      var vh = (b.vol / maxVol) * f.volH;
      ctx.fillStyle = up ? 'rgba(255,77,79,.55)' : 'rgba(18,201,140,.5)';
      ctx.fillRect(x - bodyW / 2, volTop + f.volH - vh, bodyW, vh);
    }

    // 均线
    var lines = [
      { data: this.ma5, color: '#f5c451' },
      { data: this.ma10, color: '#58a6ff' },
      { data: this.ma20, color: '#c084fc' }
    ];
    lines.forEach(function (ln) {
      ctx.beginPath();
      var started = false;
      for (var m = s; m < s + cnt; m++) {
        var val = ln.data[m];
        if (val === null || val === undefined) continue;
        if (!started) { ctx.moveTo(px(m), py(val)); started = true; }
        else ctx.lineTo(px(m), py(val));
      }
      ctx.strokeStyle = ln.color;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // 十字光标
    if (this.hover >= s && this.hover < s + cnt) {
      var b2 = bars[this.hover];
      var hx = px(this.hover);
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(hx, f.padT);
      ctx.lineTo(hx, volTop + f.volH);
      ctx.strokeStyle = 'rgba(255,255,255,.32)';
      ctx.lineWidth = 1;
      ctx.stroke();
      var hy = py(b2.close);
      ctx.beginPath();
      ctx.moveTo(f.padL, hy);
      ctx.lineTo(f.cw - f.padR, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(245,196,81,.95)';
      ctx.beginPath();
      ctx.arc(hx, hy, 2.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(20,27,37,.97)';
      ctx.fillRect(f.cw - f.padR + 2, hy - 8, f.padR - 4, 16);
      ctx.fillStyle = '#f5c451';
      ctx.textAlign = 'left';
      ctx.fillText(b2.close.toFixed(2), f.cw - f.padR + 6, hy + 3.5);
    }
  };

  KLine.prototype._tipAt = function (mx, my) {
    if (!this.tip) return;
    var i = this.hover;
    var b = this.bars[i];
    if (!b) return;
    var pct = b.pct;
    if (pct === undefined || isNaN(pct)) {
      var prev = i > 0 ? this.bars[i - 1].close : b.open;
      pct = prev ? (b.close - prev) / prev * 100 : 0;
    }
    var cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    this.tip.innerHTML =
      '<b>' + b.date + '</b><br>' +
      '开 <b>' + b.open.toFixed(2) + '</b>　高 <b>' + b.high.toFixed(2) + '</b><br>' +
      '低 <b>' + b.low.toFixed(2) + '</b>　收 <b class="' + cls + '">' + b.close.toFixed(2) + '</b><br>' +
      '涨跌 <b class="' + cls + '">' + (pct > 0 ? '+' : '') + pct.toFixed(2) + '%</b>　量 <b>' + fmtHand(b.vol) + '</b>';
    var f = this._geom();
    var tipW = 160, tipH = 82;
    var left = mx + 16;
    if (left + tipW > f.cw) left = mx - tipW - 14;
    var top = Math.max(6, Math.min(my - tipH / 2, f.ch - tipH - 6));
    this.tip.style.left = left + 'px';
    this.tip.style.top = top + 'px';
    this.tip.classList.add('on');
  };

  /* ================= 格式化 ================= */
  function fmtPct(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  }
  function fmtMoney(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e12) return (v / 1e12).toFixed(2) + '万亿';
    if (a >= 1e8) return (v / 1e8).toFixed(2) + '亿';
    if (a >= 1e4) return (v / 1e4).toFixed(2) + '万';
    return v.toFixed(0);
  }
  function fmtHand(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿手';
    if (v >= 1e4) return (v / 1e4).toFixed(1) + '万手';
    return v.toFixed(0) + '手';
  }

  global.AStockChart = {
    sparkline: sparkline,
    distChart: distChart,
    treemap: treemap,
    heatColor: heatColor,
    KLine: KLine,
    fmtPct: fmtPct,
    fmtMoney: fmtMoney,
    fmtHand: fmtHand,
    cssColor: cssColor
  };
})(window);
