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
  if (isIOS) root.setAttribute('data-ios', '1');
  if (standalone) root.setAttribute('data-standalone', '1');

  var lastH = 0, timers = [];

  function editing() {
    var a = d.activeElement;
    if (!a) return false;
    return a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  function measure() {
    if (!(isIOS && standalone)) return;
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

  /* 调试：地址后加 ?vhdebug=1 打开主屏幕 App，左上角会显示实测数值（截图发给开发者即可定位）。 */
  function debugBadge() {
    try {
      if (!/[?&]vhdebug=1/.test(location.search)) return;
      var b = d.createElement('div');
      b.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;padding:4px 7px;border-radius:6px;' +
        'background:rgba(0,0,0,.72);color:#0f0;font:10px/1.35 monospace;pointer-events:none;white-space:pre';
      (d.body || root).appendChild(b);
      var upd = function () {
        var s = window.IslandViewport.state();
        b.textContent = 'inner ' + s.innerH + ' / screen ' + s.screenH + '\nappH ' + s.appH + ' fix ' + s.fix + ' sa ' + s.standalone;
      };
      setInterval(upd, 500); upd();
    } catch (e) {}
  }
  d.addEventListener('DOMContentLoaded', debugBadge);

  window.IslandViewport = {
    /* 供其它脚本（如系统栏取色）取"真正的整屏高度"。 */
    height: function () { return lastH || window.innerHeight; },
    refresh: settle,
    state: function () {
      return {
        iPhone: isIPhone, standalone: isStandalone(), fix: root.hasAttribute('data-vh-fix'),
        appH: root.style.getPropertyValue('--app-h') || null,
        innerH: window.innerHeight, screenH: screen.height, screenW: screen.width
      };
    }
  };
})();
