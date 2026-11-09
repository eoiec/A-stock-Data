/**
 * A-Stock Data · 数据访问层
 * 全部走东方财富公开行情接口的 JSONP（无需 Key，浏览器可跨域）
 * 纯静态部署，不依赖任何后端。
 */
(function (global) {
  'use strict';

  var PUSH = 'https://push2.eastmoney.com';
  var PUSH_HIS = 'https://push2his.eastmoney.com';
  var seq = 0;

  /* ---------- JSONP ---------- */
  function jsonp(base, params, timeout) {
    timeout = timeout || 12000;
    return new Promise(function (resolve, reject) {
      var cb = '__em_cb_' + Date.now().toString(36) + '_' + (seq++);
      var qs = Object.keys(params)
        .map(function (k) { return k + '=' + params[k]; })
        .join('&');
      var url = base + '?' + qs + '&cb=' + cb;
      var script = document.createElement('script');
      var settled = false;
      var timer = setTimeout(function () { finish(new Error('timeout')); }, timeout);

      function finish(err, data) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { delete global[cb]; } catch (e) { global[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
        if (err) reject(err); else resolve(data);
      }

      global[cb] = function (data) { finish(null, data); };
      script.onerror = function () { finish(new Error('network')); };
      script.src = url;
      document.head.appendChild(script);
    });
  }

  /* ---------- 工具 ---------- */
  function num(v) {
    if (v === undefined || v === null || v === '-' || v === '') return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }

  function normDiff(data) {
    if (!data) return [];
    var d = data.diff;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    return Object.keys(d).map(function (k) { return d[k]; });
  }

  function mapRow(it) {
    return {
      code: String(it.f12 || ''),
      name: it.f14 || '',
      price: num(it.f2),
      pct: num(it.f3),
      chg: num(it.f4),
      vol: num(it.f5),
      amount: num(it.f6),
      amp: num(it.f7),
      turnover: num(it.f8),
      pe: num(it.f9),
      volRatio: num(it.f10),
      high: num(it.f15),
      low: num(it.f16),
      open: num(it.f17),
      preClose: num(it.f18),
      mcap: num(it.f20),
      fcap: num(it.f21),
      pb: num(it.f23),
      mainIn: num(it.f62),
      market: it.f13
    };
  }

  /** 股票代码 → 东财 secid（1=沪市，0=深市/北交所） */
  function secidOf(code) {
    code = String(code);
    if (/^[659]/.test(code)) return '1.' + code;
    return '0.' + code;
  }

  /* ---------- 接口 ---------- */
  var ALL_A = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23';
  var UP_DOWN_FIELDS = 'f2,f3,f4,f5,f6,f12,f14';

  var API = {
    secidOf: secidOf,
    num: num,

    /** 指数快照 */
    indices: function () {
      return jsonp(PUSH + '/api/qt/ulist.np/get', {
        fltt: 2,
        secids: '1.000001,0.399001,0.399006,1.000300,1.000688',
        fields: 'f1,f2,f3,f4,f6,f12,f13,f14'
      }).then(function (r) {
        return normDiff(r && r.data).map(function (it) {
          return {
            name: it.f14,
            code: String(it.f12),
            price: num(it.f2),
            pct: num(it.f3),
            chg: num(it.f4),
            amount: num(it.f6)
          };
        });
      });
    },

    /** 通用列表（沪深A股 / 板块等） */
    list: function (opts) {
      opts = opts || {};
      var params = {
        pn: opts.pn || 1,
        pz: opts.pz || 20,
        po: opts.po === undefined ? 1 : opts.po,
        np: 1,
        fltt: 2,
        invt: 2,
        fid: opts.fid || 'f3',
        fs: opts.fs || ALL_A,
        fields: opts.fields || 'f2,f3,f4,f5,f6,f12,f14,f15,f16,f17,f18,f20,f21,f9,f23,f62'
      };
      return jsonp(PUSH + '/api/qt/clist/get', params).then(function (r) {
        var data = (r && r.data) || {};
        var rows = normDiff(data).map(mapRow);
        // 全市场列表接口某些 fs 会返回 f13（市场），补齐
        return { total: data.total || rows.length, rows: rows };
      });
    },

    /** 涨幅榜 / 跌幅榜 */
    rank: function (dir, size) {
      return API.list({
        pn: 1,
        pz: size || 15,
        po: dir === 'desc' ? 1 : 0,
        fid: 'f3',
        fs: ALL_A
      });
    },

    /** 行业板块（按成交额排序） */
    sectors: function (size) {
      return API.list({
        pn: 1,
        pz: size || 60,
        po: 1,
        fid: 'f6',
        fs: 'm:90+t:2',
        fields: 'f2,f3,f6,f12,f14,f62,f104,f105,f128,f136'
      });
    },

    /** K 线：klt 101 日 / 102 周 / 103 月；code 可以是 "1.600519" / "90.BK0437" 这样的完整 secid */
    kline: function (code, klt, limit) {
      var secid = /^\d+\./.test(code) ? code : secidOf(code);
      return jsonp(PUSH_HIS + '/api/qt/stock/kline/get', {
        secid: secid,
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: klt || 101,
        fqt: 1,
        end: '20500101',
        lmt: limit || 120
      }).then(function (r) {
        var d = (r && r.data) || {};
        var bars = (d.klines || []).map(function (line) {
          var p = line.split(',');
          return {
            date: p[0],
            open: +p[1],
            close: +p[2],
            high: +p[3],
            low: +p[4],
            vol: +p[5],
            amount: +p[6],
            pct: +p[8],
            chg: +p[9],
            turnover: +p[10]
          };
        });
        return { name: d.name, code: d.code, bars: bars, total: d.dktotal || bars.length };
      });
    },

    /** 按代码批量取快照（自选股） */
    quotes: function (codes) {
      if (!codes.length) return Promise.resolve([]);
      return jsonp(PUSH + '/api/qt/ulist.np/get', {
        fltt: 2,
        secids: codes.map(secidOf).join(','),
        fields: 'f1,f2,f3,f4,f6,f12,f13,f14,f15,f16,f17,f18,f20,f21,f9,f23,f8,f10,f7'
      }).then(function (r) {
        return normDiff(r && r.data).map(mapRow);
      });
    },

    /**
     * 全市场扫描：分页拉全量（每页 100 条，最多 56 页），并发 5
     * 记录每页是否成功，最后对失败页做补抓，尽量保证样本完整
     * onProgress(done, pages)
     */
    scanAll: function (onProgress) {
      var pz = 100;
      var fields = UP_DOWN_FIELDS + ',f6';

      function page(pn, retry) {
        return API.list({ pn: pn, pz: pz, po: 1, fid: 'f3', fs: ALL_A, fields: fields })
          .catch(function (err) {
            if (retry > 0) {
              return new Promise(function (res) { setTimeout(res, 300 + Math.random() * 300); })
                .then(function () { return page(pn, retry - 1); });
            }
            throw err;
          });
      }

      return page(1, 2).then(function (first) {
        var total = first.total || 0;
        var pages = Math.max(1, Math.ceil(total / pz));
        var buckets = new Array(pages + 1);   // 下标即页码
        buckets[1] = first.rows;
        var done = 1;

        if (onProgress) onProgress(done, pages);

        var queue = [];
        for (var i = 2; i <= pages; i++) queue.push(i);

        var worker = function () {
          if (!queue.length) return Promise.resolve();
          var pn = queue.shift();
          return page(pn, 2)
            .then(function (r) { buckets[pn] = r.rows; })
            .catch(function () { buckets[pn] = null; })
            .then(function () {
              done++;
              if (onProgress) onProgress(done, pages);
              return worker();
            });
        };

        var workers = [];
        for (var k = 0; k < 5; k++) workers.push(worker());

        return Promise.all(workers).then(function () {
          // 补抓失败页，最多两轮，顺序执行降低被限流概率
          var missing = [];
          for (var j = 1; j <= pages; j++) if (!buckets[j]) missing.push(j);
          var round = 0;

          function retryMissing() {
            if (!missing.length || round >= 2) return Promise.resolve();
            round++;
            var list = missing.slice();
            missing = [];
            return list.reduce(function (prev, pn) {
              return prev.then(function () {
                return page(pn, 1)
                  .then(function (r) { buckets[pn] = r.rows; })
                  .catch(function () { missing.push(pn); });
              });
            }, Promise.resolve()).then(retryMissing);
          }

          return retryMissing().then(function () {
            var rows = [];
            var seen = Object.create(null);
            for (var m = 1; m <= pages; m++) {
              var b = buckets[m];
              if (!b) continue;
              for (var n = 0; n < b.length; n++) {
                var r = b[n];
                if (!r || !r.code || seen[r.code]) continue;
                seen[r.code] = 1;
                rows.push(r);
              }
            }
            return rows;
          });
        });
      });
    }
  };

  global.AStockAPI = API;
})(window);
