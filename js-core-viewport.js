/* 岛屿 · 视口修正（iOS 添加到主屏幕后的全屏适配）
 *
 * 要解决的问题：iOS 的「添加到主屏幕」网页，状态栏已经穿透到页面里（apple-mobile-web-app-status-bar-style=black-translucent），
 * 但有时 100vh / 100dvh / window.innerHeight 会比真实屏幕矮一截（典型表现：底栏被整体抬起，下面留一大片空白）。
 * 页面里所有 position:fixed; bottom:0 的东西都以这个"偏矮的视口"为参照，所以一起被抬高了。
 *
 * 做法：
 *   1. 只在「iOS + 已安装为主屏幕 App」时介入，浏览器标签页、安卓、APK 完全不受影响；
 *   2. 用 screen 的真实尺寸算出整屏高度，写到 --app-h；
 *   3. 给 <html> 打上 data-vh-fix，CSS 会让 <body> 以 --app-h 为高度并成为所有 fixed 元素的参照，
 *      于是整个岛屿（壁纸、桌面、各 App、弹层、底栏）都以"真正的整屏"为准：顶部穿透状态栏，底部贴到屏幕底边；
 *   4. 在键盘弹出（输入框聚焦）时不重算，避免聊天输入栏跳动；旋转 / 回到前台 / 页面显示时重新量。
 * 调试：控制台执行 IslandViewport.state()。 */
(function () {
  'use strict';
  var d = document, root = d.documentElement, ua = navigator.userAgent || '';
  var isIPhone = /iPhone|iPod/.test(ua);
  var isIOS = isIPhone || /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function isStandalone() {
    try {
      if (navigator.standalone === true) return true;
      return !!(window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches));
    } catch (e) { return false; }
  }

  var standalone = isStandalone();
  /* 视口模式（可在 App 里用【四根手指同时点屏幕】切换，会记住）：
   *   0 = 方案 A：强制整屏高度（页面铺满，顶部穿透）
   *   1 = 方案 B：完全信任系统给的视口（不做任何高度修正），状态栏颜色跟随页面顶部
   *   2 = 方案 C：在 A 的基础上去掉顶部“固定定位 + 纯色”，避免系统给状态栏区域垫色
   * 不同 iOS 版本对主屏幕 App 的处理不一样，先用这个现场试出哪个对，再固化成默认。 */
  var vhmode = '0';
  try { vhmode = localStorage.getItem('island-vhmode') || '0'; } catch (e) {}
  if (vhmode !== '0' && vhmode !== '1' && vhmode !== '2') vhmode = '0';
  root.setAttribute('data-vhmode', vhmode);
  if (isIOS) root.setAttribute('data-ios', '1');
  if (standalone) root.setAttribute('data-standalone', '1');

  /* iOS 主屏幕 App：theme-color 会被系统拿来给状态栏区域单独上色（iOS 26 还会做渐变 / 模糊延伸），
   * 这正是“状态栏有一块独立底色”的来源。这里直接把它移除，状态栏就只剩透明 + 时间 / 信号 / 电量。 */
  if (isIOS && standalone && vhmode !== '1') {
    try {
      var tcs = d.querySelectorAll('meta[name="theme-color"]');
      for (var ti = 0; ti < tcs.length; ti++) tcs[ti].parentNode.removeChild(tcs[ti]);
    } catch (e) {}
  }

  var lastH = 0, timers = [];

  function editing() {
    var a = d.activeElement;
    if (!a) return false;
    return a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  function measure() {
    if (!(isIOS && standalone) || vhmode === '1') return;
    if (editing()) return; /* 键盘弹出时保持原高度 */
    var sw = screen.width || 0, sh = screen.height || 0;
    if (!sw || !sh) return;
    var portrait = window.innerHeight >= window.innerWidth;
    var full = portrait ? Math.max(sw, sh) : Math.min(sw, sh);
    /* 取"整屏高度"与"浏览器报告高度"中较大者：报告值偏矮时靠 screen 补足，报告值正常时不改变任何东西。 */
    var h = Math.max(window.innerHeight || 0, full);
    if (!h) return;
    if (h !== lastH) {
      lastH = h;
      root.style.setProperty('--app-h', h + 'px');
    }
    if (!root.hasAttribute('data-vh-fix')) root.setAttribute('data-vh-fix', '1');
  }

  /* iOS 在启动 / 旋转 / 回到前台后，尺寸有时晚几百毫秒才更新：多补量几次。 */
  function settle() {
    measure();
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [60, 200, 450, 900, 1600].map(function (ms) { return setTimeout(measure, ms); });
  }

  measure();
  d.addEventListener('DOMContentLoaded', settle);
  window.addEventListener('load', settle);
  window.addEventListener('resize', settle);
  window.addEventListener('orientationchange', settle);
  window.addEventListener('pageshow', settle);
  window.addEventListener('focus', settle);
  d.addEventListener('visibilitychange', function () { if (!d.hidden) settle(); });
  /* 输入框失焦（键盘收起）后重新量一次。 */
  d.addEventListener('focusout', function () { setTimeout(measure, 350); }, true);

  /* 诊断面板：已安装的主屏幕 App 会丢掉地址后面的 ?参数，所以不能靠地址打开。
   * 打开方式（任选）：① 地址带 ?vhdebug=1（浏览器里）；② 在 App 里用【三根手指同时点一下屏幕】开 / 关（会记住）。
   * 面板显示在屏幕上方偏下的位置，截图发给开发者即可。 */
  var dbgBox = null, dbgTimer = 0, probe = null, rulers = [];
  function sai() {
    try {
      if (!probe) {
        probe = d.createElement('div');
        probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
        (d.body || root).appendChild(probe);
      }
      var cs = getComputedStyle(probe);
      return parseFloat(cs.paddingTop) + '/' + parseFloat(cs.paddingBottom);
    } catch (e) { return '?'; }
  }
  function rectTop(sel) {
    try { var el = d.querySelector(sel); if (!el) return '-'; var r = el.getBoundingClientRect(); return Math.round(r.top) + '~' + Math.round(r.bottom); } catch (e) { return '?'; }
  }
  function debugText() {
    var s = window.IslandViewport.state(), vv = window.visualViewport;
    var tc = d.querySelector('meta[name="theme-color"]');
    return 'inner ' + s.innerW + 'x' + s.innerH + ' / screen ' + s.screenW + 'x' + s.screenH +
      '\nappH ' + s.appH + ' fix ' + s.fix + ' standalone ' + s.standalone +
      '\nnav.standalone ' + navigator.standalone + ' dm-full ' + (matchMedia('(display-mode: fullscreen)').matches) + ' dm-sa ' + (matchMedia('(display-mode: standalone)').matches) +
      '\nsafe top/bottom ' + sai() +
      '\nvv ' + (vv ? Math.round(vv.width) + 'x' + Math.round(vv.height) + ' off ' + Math.round(vv.offsetTop) : '-') + ' scrollY ' + Math.round(window.scrollY) +
      '\nbody ' + rectTop('body') + ' wallpaper ' + rectTop('.wallpaper') + ' home ' + rectTop('.home') +
      '\nMODE ' + vhmode + '  (四指点屏幕切换 0/1/2；红条=页面顶边 蓝条=页面底边)' +
      '\ntheme-color ' + (tc ? tc.getAttribute('content') : 'none') + ' sw ' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 'on' : 'off');
  }
  function showDebug(on) {
    try { localStorage.setItem('island-vhdebug', on ? '1' : '0'); } catch (e) {}
    if (!on) {
      if (dbgBox && dbgBox.parentNode) dbgBox.parentNode.removeChild(dbgBox);
      dbgBox = null; clearInterval(dbgTimer);
      rulers.forEach(function (r) { if (r.parentNode) r.parentNode.removeChild(r); }); rulers = [];
      return;
    }
    if (dbgBox) return;
    dbgBox = d.createElement('div');
    dbgBox.style.cssText = 'position:fixed;left:6px;top:96px;z-index:2147483647;padding:5px 8px;border-radius:6px;' +
      'background:rgba(0,0,0,.78);color:#0f0;font:10px/1.4 monospace;pointer-events:none;white-space:pre;max-width:96vw';
    (d.body || root).appendChild(dbgBox);
    /* 标尺：页面最顶 / 最底各画一条，截图一眼看出页面到底有没有铺到屏幕边缘 */
    rulers = [['top:0', '#ff2d2d'], ['bottom:0', '#2d6bff']].map(function (p) {
      var r = d.createElement('div');
      r.style.cssText = 'position:fixed;left:0;right:0;' + p[0] + ';height:4px;background:' + p[1] + ';z-index:2147483646;pointer-events:none';
      (d.body || root).appendChild(r); return r;
    });
    var upd = function () { dbgBox.textContent = debugText(); };
    dbgTimer = setInterval(upd, 500); upd();
  }
  function debugInit() {
    var want = false;
    try { want = /[?&]vhdebug=1/.test(location.search) || localStorage.getItem('island-vhdebug') === '1'; } catch (e) {}
    if (want) showDebug(true);
    d.addEventListener('touchstart', function (e) {
      if (!e.touches) return;
      if (e.touches.length === 3) showDebug(!dbgBox);
      else if (e.touches.length === 4) {
        try { localStorage.setItem('island-vhmode', String((parseInt(vhmode, 10) + 1) % 3)); } catch (err) {}
        location.reload();
      }
    }, { passive: true });
  }
  d.addEventListener('DOMContentLoaded', debugInit);

  window.IslandViewport = {
    /* 供其它脚本（如系统栏取色）取"真正的整屏高度"。 */
    height: function () { return lastH || window.innerHeight; },
    refresh: settle,
    state: function () {
      return {
        iPhone: isIPhone, standalone: isStandalone(), fix: root.hasAttribute('data-vh-fix'),
        appH: root.style.getPropertyValue('--app-h') || null,
        innerH: window.innerHeight, innerW: window.innerWidth, screenH: screen.height, screenW: screen.width
      };
    }
  };
})();
