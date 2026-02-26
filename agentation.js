/**
 * agentation.js — Vanilla JS版 UI アノテーションツール v3
 *
 * 使い方: </body> 直前に <script src="agentation.js"></script> を追加するだけ
 *
 * 機能:
 *   - 📌 右下ツールバー or [A]キー でアノテーションモードON/OFF
 *   - 要素クリック → コメント入力 → 要素そばにマーカー＆ポップアップ表示
 *   - マーカークリックで再編集・個別削除
 *   - マーカーホバーでコメント内容をtooltip表示
 *   - 📋 Markdownコピー（CSSセレクター・クラス名・コメント付き）
 *   - 📝 一覧パネルで全アノテーションを確認・個別削除
 *   - 🗑 全削除
 *   - スクロール・リサイズ時にマーカー＆ポップアップが要素に追従
 *   - 本番環境では自動的に非動作（localhost / 127.0.0.1 のみ）
 */

(function () {
  'use strict';

  // ── 本番環境ガード ─────────────────────────────────────────
  const hostname = location.hostname;
  const isDev =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname === '' ||
    hostname.endsWith('.local');
  if (!isDev) return;

  // ── 状態管理 ───────────────────────────────────────────────
  let isActive       = false;
  let annotations    = [];    // { id, el, selector, short, tag, text, classes, position, comment }
  let counter        = 0;
  let editingId      = null;  // 再編集中のアノテーションID（nullなら新規）
  let pendingTarget  = null;  // ポップアップ対象要素（新規時）
  let popupAnchorEl  = null;  // ポップアップの基準要素（追従用）
  let highlightTarget = null;
  let rafId          = null;
  let panelOpen      = false;

  // ── スタイル ───────────────────────────────────────────────
  const STYLES = `
    /* ── ツールバー ── */
    #agn-toolbar {
      position: fixed; bottom: 20px; right: 20px; z-index: 999990;
      display: flex; align-items: center; gap: 6px;
      background: #1a1a1a; border-radius: 99px; padding: 8px 14px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.45);
      font-family: system-ui,-apple-system,sans-serif; user-select: none;
    }
    #agn-toolbar button {
      background: none; border: none; cursor: pointer; font-size: 16px;
      padding: 4px 6px; border-radius: 6px; color: rgba(255,255,255,0.75);
      transition: background .15s, color .15s; line-height: 1;
    }
    #agn-toolbar button:hover  { background: rgba(255,255,255,0.1); color: #fff; }
    #agn-toolbar button.agn-active { color: #3b82f6; background: rgba(59,130,246,0.2); }
    #agn-toolbar button.agn-danger { color: #ef4444; }
    #agn-badge {
      font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5);
      min-width: 14px; text-align: center;
    }
    .agn-sep { width: 1px; height: 16px; background: rgba(255,255,255,0.15); margin: 0 2px; }

    /* ── ホバーハイライト（fixed: viewport追従） ── */
    #agn-highlight {
      position: fixed; pointer-events: none; z-index: 999970; display: none;
      border: 2px solid rgba(59,130,246,0.7); border-radius: 4px;
      background: rgba(59,130,246,0.06);
    }

    /* ── ポップアップ（absolute: ページ座標追従） ── */
    #agn-popup {
      position: absolute; z-index: 999995; display: none;
      background: #1e1e2e; border-radius: 12px; padding: 12px 14px 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08);
      width: 244px; font-family: system-ui,-apple-system,sans-serif;
    }
    #agn-popup.agn-show { display: block; }
    #agn-popup-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 8px;
    }
    #agn-popup-label {
      font-size: 10px; color: rgba(255,255,255,0.4); font-weight: 600;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
    }
    #agn-popup-close {
      background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.3);
      font-size: 14px; padding: 0 0 0 8px; line-height: 1;
    }
    #agn-popup-close:hover { color: rgba(255,255,255,0.7); }
    #agn-popup-input {
      width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: #fff;
      font-size: 13px; padding: 8px 10px; resize: none; outline: none;
      font-family: inherit; line-height: 1.5; height: 72px;
    }
    #agn-popup-input:focus { border-color: rgba(59,130,246,0.6); }
    #agn-popup-actions {
      display: flex; justify-content: space-between; align-items: center; margin-top: 8px;
    }
    #agn-btn-delete-ann {
      font-size: 11px; color: #ef4444; background: none; border: none;
      cursor: pointer; padding: 4px 2px; font-family: inherit;
      display: none; /* 再編集時のみ表示 */
    }
    #agn-btn-delete-ann:hover { text-decoration: underline; }
    .agn-popup-right { display: flex; gap: 6px; }
    .agn-popup-right button {
      font-size: 12px; font-weight: 600; padding: 6px 14px;
      border-radius: 20px; border: none; cursor: pointer; font-family: inherit;
    }
    #agn-btn-cancel { background: transparent; color: rgba(255,255,255,0.4); }
    #agn-btn-cancel:hover { color: rgba(255,255,255,0.7); }
    #agn-btn-add { background: #3b82f6; color: #fff; }
    #agn-btn-add:hover { background: #2563eb; }

    /* ── マーカー（absolute: ページ座標追従） ── */
    .agn-marker {
      position: absolute; z-index: 999985;
      width: 22px; height: 22px; border-radius: 50%;
      background: #3b82f6; color: #fff; font-size: 11px; font-weight: 700;
      font-family: system-ui,-apple-system,sans-serif;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      transform: translate(-50%, -50%);
      cursor: pointer;
      transition: transform .15s, background .15s;
    }
    .agn-marker:hover { transform: translate(-50%,-50%) scale(1.2); background: #2563eb; }
    .agn-marker.agn-editing { background: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,0.3); }

    /* ── Tooltip（マーカーホバー） ── */
    .agn-tooltip {
      position: absolute; z-index: 999996;
      background: #0f0f1a; color: #e2e8f0;
      font-size: 12px; line-height: 1.5;
      padding: 7px 10px; border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06);
      width: max-content; max-width: 220px;
      white-space: pre-wrap; word-break: break-word;
      pointer-events: none;
      font-family: system-ui,-apple-system,sans-serif;
      /* left はJSで制御するためtransformなし */
    }
    .agn-tooltip::after {
      content: ''; position: absolute; top: -5px;
      /* left はJS側で --arrow-left カスタムプロパティで制御 */
      left: var(--arrow-left, 50%);
      transform: translateX(-50%);
      border: 5px solid transparent; border-bottom-color: #0f0f1a;
      border-top: none;
    }

    /* ── 一覧パネル ── */
    #agn-panel {
      position: fixed; top: 0; right: 0; bottom: 0; z-index: 999988;
      width: 280px; background: #13131f;
      box-shadow: -4px 0 24px rgba(0,0,0,0.5);
      font-family: system-ui,-apple-system,sans-serif;
      display: none; flex-direction: column;
      border-left: 1px solid rgba(255,255,255,0.06);
    }
    #agn-panel.agn-show { display: flex; }
    #agn-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.07);
      flex-shrink: 0;
    }
    #agn-panel-title {
      font-size: 13px; font-weight: 700; color: #e2e8f0; letter-spacing: .3px;
    }
    #agn-panel-close {
      background: none; border: none; cursor: pointer;
      color: rgba(255,255,255,0.4); font-size: 18px; line-height: 1; padding: 0;
    }
    #agn-panel-close:hover { color: #fff; }
    #agn-panel-list {
      flex: 1; overflow-y: auto; padding: 8px 0;
    }
    #agn-panel-list::-webkit-scrollbar { width: 4px; }
    #agn-panel-list::-webkit-scrollbar-track { background: transparent; }
    #agn-panel-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
    .agn-panel-item {
      padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.04);
      display: flex; gap: 10px; align-items: flex-start;
    }
    .agn-panel-item:hover { background: rgba(255,255,255,0.03); }
    .agn-panel-num {
      width: 20px; height: 20px; border-radius: 50%; background: #3b82f6;
      color: #fff; font-size: 10px; font-weight: 700; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      margin-top: 1px;
    }
    .agn-panel-body { flex: 1; min-width: 0; }
    .agn-panel-selector {
      font-size: 10px; color: rgba(255,255,255,0.35);
      font-family: ui-monospace, monospace; margin-bottom: 3px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .agn-panel-comment {
      font-size: 12px; color: #cbd5e1; line-height: 1.5; word-break: break-word;
    }
    .agn-panel-del {
      background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.2);
      font-size: 14px; padding: 0; flex-shrink: 0; margin-top: 1px; line-height: 1;
    }
    .agn-panel-del:hover { color: #ef4444; }
    #agn-panel-empty {
      padding: 40px 16px; text-align: center;
      font-size: 13px; color: rgba(255,255,255,0.2);
    }
    #agn-panel-footer {
      padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.07);
      flex-shrink: 0; display: flex; gap: 8px;
    }
    #agn-panel-copy-btn {
      flex: 1; padding: 9px; background: #3b82f6; color: #fff;
      border: none; border-radius: 8px; font-size: 13px; font-weight: 600;
      cursor: pointer; font-family: inherit;
    }
    #agn-panel-copy-btn:hover { background: #2563eb; }
    #agn-panel-clear-btn {
      padding: 9px 14px; background: rgba(239,68,68,0.12); color: #ef4444;
      border: none; border-radius: 8px; font-size: 13px; font-weight: 600;
      cursor: pointer; font-family: inherit;
    }
    #agn-panel-clear-btn:hover { background: rgba(239,68,68,0.22); }

    /* アノテーションモード中のカーソル */
    body.agn-mode * { cursor: crosshair !important; }
    body.agn-mode .agn-marker,
    body.agn-mode .agn-marker * { cursor: pointer !important; }
  `;

  // ── DOM構築 ────────────────────────────────────────────────
  function buildUI() {
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    // ハイライト
    const hl = document.createElement('div');
    hl.id = 'agn-highlight';
    document.body.appendChild(hl);

    // ポップアップ
    const popup = document.createElement('div');
    popup.id = 'agn-popup';
    popup.innerHTML = `
      <div id="agn-popup-header">
        <div id="agn-popup-label"></div>
        <button id="agn-popup-close" title="閉じる">✕</button>
      </div>
      <textarea id="agn-popup-input" placeholder="フィードバックを入力…"></textarea>
      <div id="agn-popup-actions">
        <button id="agn-btn-delete-ann">🗑 削除</button>
        <div class="agn-popup-right">
          <button id="agn-btn-cancel">キャンセル</button>
          <button id="agn-btn-add">追加</button>
        </div>
      </div>`;
    document.body.appendChild(popup);

    // 一覧パネル
    const panel = document.createElement('div');
    panel.id = 'agn-panel';
    panel.innerHTML = `
      <div id="agn-panel-header">
        <div id="agn-panel-title">📋 アノテーション一覧</div>
        <button id="agn-panel-close">✕</button>
      </div>
      <div id="agn-panel-list"></div>
      <div id="agn-panel-footer">
        <button id="agn-panel-copy-btn">📋 Markdownをコピー</button>
        <button id="agn-panel-clear-btn">全削除</button>
      </div>`;
    document.body.appendChild(panel);

    // ツールバー
    const toolbar = document.createElement('div');
    toolbar.id = 'agn-toolbar';
    toolbar.innerHTML = `
      <button id="agn-btn-toggle" title="アノテーションモード (A)">📌</button>
      <span id="agn-badge">0</span>
      <div class="agn-sep"></div>
      <button id="agn-btn-list"  title="一覧を見る">📝</button>
      <button id="agn-btn-copy"  title="Markdownをコピー">📋</button>
      <button id="agn-btn-clear" title="全削除" class="agn-danger">🗑</button>`;
    document.body.appendChild(toolbar);
  }

  // ── 座標ユーティリティ ─────────────────────────────────────
  function getPageRect(el) {
    const r = el.getBoundingClientRect();
    return {
      left:   r.left   + window.scrollX,
      top:    r.top    + window.scrollY,
      right:  r.right  + window.scrollX,
      bottom: r.bottom + window.scrollY,
      width:  r.width,
      height: r.height,
    };
  }

  // ── セレクター生成 ─────────────────────────────────────────
  function getSelector(el) {
    if (!el || el === document.body) return 'body';
    if (el.id) return '#' + el.id;
    const tag = el.tagName.toLowerCase();
    const cls = Array.from(el.classList)
      .filter(c => !c.startsWith('agn-')).slice(0, 3).map(c => '.' + c).join('');
    const parent = el.parentElement;
    if (!parent) return tag + cls;
    const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
    if (siblings.length > 1) {
      const idx = siblings.indexOf(el) + 1;
      return getSelector(parent) + ' > ' + tag + ':nth-of-type(' + idx + ')';
    }
    return getSelector(parent) + ' > ' + tag + cls;
  }

  function getShortSelector(el) {
    if (el.id) return '#' + el.id;
    const tag = el.tagName.toLowerCase();
    const cls = Array.from(el.classList)
      .filter(c => !c.startsWith('agn-')).slice(0, 2).map(c => '.' + c).join('');
    return tag + cls;
  }

  // ── マーカー ───────────────────────────────────────────────
  function createMarker(ann) {
    const m = document.createElement('div');
    m.className = 'agn-marker';
    m.id = 'agn-marker-' + ann.id;
    m.textContent = ann.id;
    // title属性は設定しない（カスタムtooltipで代替するためネイティブtooltipは不要）
    document.body.appendChild(m);
    updateMarkerPos(m, ann.el);
    bindMarkerEvents(m, ann);
  }

  function updateMarkerPos(markerEl, targetEl) {
    const pr = getPageRect(targetEl);
    markerEl.style.left = pr.right + 'px';
    markerEl.style.top  = pr.top   + 'px';
  }

  function refreshAllMarkers() {
    for (const ann of annotations) {
      const m = document.getElementById('agn-marker-' + ann.id);
      if (m && ann.el) updateMarkerPos(m, ann.el);
    }
  }

  // ── Tooltip ────────────────────────────────────────────────
  let tooltipEl = null;

  function showTooltip(markerEl, ann) {
    removeTooltip();
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'agn-tooltip';
    tooltipEl.textContent = `[${ann.id}] ${ann.short}\n${ann.comment}`;
    document.body.appendChild(tooltipEl);
    positionTooltip(markerEl);
  }

  function positionTooltip(markerEl) {
    if (!tooltipEl) return;

    const ml = parseFloat(markerEl.style.left); // マーカー中心X（ページ絶対座標）
    const mt = parseFloat(markerEl.style.top);  // マーカー中心Y

    // 画面外に仮置きしてレイアウト確定後に実幅を取得
    // （getBoundingClientRect前に表示位置をセットすると幅の折り返しが変わるため）
    tooltipEl.style.left = '-9999px';
    tooltipEl.style.top  = '-9999px';
    const tw     = tooltipEl.getBoundingClientRect().width;
    const vw     = window.innerWidth;
    const margin = 8;

    // デフォルト: tooltip中央をマーカー中心に揃える
    let left = ml - tw / 2;

    // 右端はみ出し補正
    const rightLimit = window.scrollX + vw - margin;
    if (left + tw > rightLimit) left = rightLimit - tw;

    // 左端はみ出し補正
    const leftLimit = window.scrollX + margin;
    if (left < leftLimit) left = leftLimit;

    // 確定座標を一度だけセット
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top  = (mt + 14) + 'px';

    // 三角マーカー（::after）: マーカー中心のtooltip内相対位置
    const arrowLeft = Math.min(
      Math.max(ml - left, 14),
      tw - 14
    );
    tooltipEl.style.setProperty('--arrow-left', arrowLeft + 'px');
  }

  function removeTooltip() {
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
  }

  // ── マーカーイベント ───────────────────────────────────────
  function bindMarkerEvents(markerEl, ann) {
    // ホバー: tooltip表示
    markerEl.addEventListener('mouseenter', () => {
      if (editingId === ann.id) return; // 編集中は出さない
      showTooltip(markerEl, ann);
    });
    markerEl.addEventListener('mouseleave', removeTooltip);

    // クリック: 再編集ポップアップを開く
    markerEl.addEventListener('click', e => {
      e.stopPropagation();
      removeTooltip();
      openEditPopup(ann);
    });
  }

  // ── ポップアップ ───────────────────────────────────────────
  // anchorEl: ポップアップを追従させる基準要素
  function openNewPopup(el) {
    editingId     = null;
    pendingTarget = el;
    popupAnchorEl = el;

    document.getElementById('agn-popup-label').textContent = getShortSelector(el);
    document.getElementById('agn-popup-input').value = '';
    document.getElementById('agn-btn-add').textContent  = '追加';
    document.getElementById('agn-btn-delete-ann').style.display = 'none';

    showPopup(el);
  }

  function openEditPopup(ann) {
    editingId     = ann.id;
    pendingTarget = ann.el;
    popupAnchorEl = ann.el;

    // 他のマーカーの編集ハイライトを外す
    document.querySelectorAll('.agn-marker').forEach(m => m.classList.remove('agn-editing'));
    document.getElementById('agn-marker-' + ann.id).classList.add('agn-editing');

    document.getElementById('agn-popup-label').textContent = `[${ann.id}] ${ann.short}`;
    document.getElementById('agn-popup-input').value = ann.comment;
    document.getElementById('agn-btn-add').textContent  = '更新';
    document.getElementById('agn-btn-delete-ann').style.display = 'block';

    showPopup(ann.el);
    setTimeout(() => document.getElementById('agn-popup-input').focus(), 50);
  }

  function showPopup(anchorEl) {
    const popup = document.getElementById('agn-popup');
    popup.classList.add('agn-show');
    positionPopupByEl(anchorEl);
    setTimeout(() => document.getElementById('agn-popup-input').focus(), 50);
  }

  // ポップアップを要素のそばに配置（ページ絶対座標）
  function positionPopupByEl(el) {
    const popup = document.getElementById('agn-popup');
    const pr  = getPageRect(el);
    const pw  = 244, ph = 170;
    const vw  = window.innerWidth, vh = window.innerHeight;

    // viewport内の要素位置で端チェック
    const r = el.getBoundingClientRect();

    // 基本: 要素の右側
    let left = pr.right + 12;
    let top  = pr.top;

    // 右端をはみ出す → 左側へ
    if (r.right + 12 + pw > vw - 10) left = pr.left - pw - 12;
    // 左端もはみ出す → 要素の下
    if (left < window.scrollX + 10)  { left = pr.left; top = pr.bottom + 8; }
    // 下端をはみ出す → 上へ
    if (r.bottom + 8 + ph > vh - 10 && top === pr.bottom + 8) top = pr.top - ph - 8;

    popup.style.left = left + 'px';
    popup.style.top  = top  + 'px';
  }

  // スクロール時にポップアップ位置を再計算
  function refreshPopup() {
    const popup = document.getElementById('agn-popup');
    if (!popup.classList.contains('agn-show') || !popupAnchorEl) return;
    positionPopupByEl(popupAnchorEl);
  }

  function hidePopup() {
    document.getElementById('agn-popup').classList.remove('agn-show');
    // 編集ハイライトを外す
    if (editingId !== null) {
      const m = document.getElementById('agn-marker-' + editingId);
      if (m) m.classList.remove('agn-editing');
    }
    editingId     = null;
    pendingTarget = null;
    popupAnchorEl = null;
    hideHighlight();
  }

  // ── ハイライト ─────────────────────────────────────────────
  function showHighlight(el) {
    highlightTarget = el;
    const r = el.getBoundingClientRect();
    const hl = document.getElementById('agn-highlight');
    hl.style.cssText = `display:block;left:${r.left-2}px;top:${r.top-2}px;width:${r.width+4}px;height:${r.height+4}px;`;
  }

  function hideHighlight() {
    highlightTarget = null;
    document.getElementById('agn-highlight').style.display = 'none';
  }

  function refreshHighlight() {
    if (highlightTarget) showHighlight(highlightTarget);
  }

  // ── アノテーション CRUD ────────────────────────────────────
  function commitAnnotation() {
    const comment = document.getElementById('agn-popup-input').value.trim();
    if (!comment) { hidePopup(); return; }

    if (editingId !== null) {
      // 更新
      const ann = annotations.find(a => a.id === editingId);
      if (ann) {
        ann.comment = comment;
        const m = document.getElementById('agn-marker-' + ann.id);
      }
    } else {
      // 新規
      if (!pendingTarget) { hidePopup(); return; }
      counter++;
      const el = pendingTarget;
      const pr = getPageRect(el);
      const ann = {
        id:       counter,
        el,
        selector: getSelector(el),
        short:    getShortSelector(el),
        tag:      el.tagName,
        text:     el.textContent.trim().slice(0, 60),
        classes:  Array.from(el.classList).filter(c => !c.startsWith('agn-')).join(' '),
        position: { x: Math.round(pr.left + pr.width/2), y: Math.round(pr.top + pr.height/2) },
        comment,
      };
      annotations.push(ann);
      createMarker(ann);
    }

    updateBadge();
    refreshPanel();
    hidePopup();
  }

  function deleteAnnotation(id) {
    annotations = annotations.filter(a => a.id !== id);
    const m = document.getElementById('agn-marker-' + id);
    if (m) m.remove();
    updateBadge();
    refreshPanel();
    hidePopup();
  }

  // ── Markdown生成 ───────────────────────────────────────────
  function generateMarkdown() {
    if (!annotations.length) return '// アノテーションがありません';
    const lines = ['## Agentation Annotations', ''];
    for (const a of annotations) {
      lines.push(`### [${a.id}] ${a.short}`);
      lines.push(`- **Selector:** \`${a.selector}\``);
      lines.push(`- **Tag:** ${a.tag}`);
      if (a.text)    lines.push(`- **Text:** ${a.text}`);
      if (a.classes) lines.push(`- **Classes:** ${a.classes}`);
      lines.push(`- **Position:** x:${a.position.x} y:${a.position.y}`);
      lines.push(`- **Comment:** ${a.comment}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  // ── クリップボードコピー ───────────────────────────────────
  function copyToClipboard(text, btn, emptyLabel = '💬') {
    if (!annotations.length) {
      btn.textContent = emptyLabel;
      setTimeout(() => { btn.textContent = btn.dataset.icon || '📋'; }, 1200);
      return;
    }
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try {
        document.execCommand('copy');
        btn.textContent = '✅';
      } catch (e) {
        btn.textContent = '❌';
        console.error('[agentation] コピー失敗:', e);
      } finally {
        document.body.removeChild(ta);
        setTimeout(() => { btn.textContent = btn.dataset.icon || '📋'; }, 1500);
      }
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => { btn.textContent = '✅'; setTimeout(() => { btn.textContent = btn.dataset.icon || '📋'; }, 1500); })
        .catch(fallback);
    } else { fallback(); }
  }

  // ── 一覧パネル ─────────────────────────────────────────────
  function refreshPanel() {
    const list = document.getElementById('agn-panel-list');
    if (!list) return;
    list.innerHTML = '';
    if (!annotations.length) {
      list.innerHTML = '<div id="agn-panel-empty">アノテーションはまだありません</div>';
      return;
    }
    for (const ann of annotations) {
      const item = document.createElement('div');
      item.className = 'agn-panel-item';
      item.innerHTML = `
        <div class="agn-panel-num">${ann.id}</div>
        <div class="agn-panel-body">
          <div class="agn-panel-selector">${ann.selector}</div>
          <div class="agn-panel-comment">${ann.comment}</div>
        </div>
        <button class="agn-panel-del" title="削除" data-id="${ann.id}">✕</button>`;
      // 削除ボタン
      item.querySelector('.agn-panel-del').addEventListener('click', e => {
        e.stopPropagation();
        deleteAnnotation(parseInt(e.target.dataset.id));
      });
      // 行クリックで該当要素にスクロール＆再編集
      item.querySelector('.agn-panel-body').addEventListener('click', () => {
        ann.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => openEditPopup(ann), 400);
      });
      list.appendChild(item);
    }
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    const panel = document.getElementById('agn-panel');
    panel.classList.toggle('agn-show', panelOpen);
    const btn = document.getElementById('agn-btn-list');
    btn.classList.toggle('agn-active', panelOpen);
    if (panelOpen) refreshPanel();
  }

  // ── バッジ・全削除 ─────────────────────────────────────────
  function updateBadge() {
    document.getElementById('agn-badge').textContent = annotations.length;
  }

  function clearAll() {
    annotations = []; counter = 0;
    document.querySelectorAll('.agn-marker').forEach(m => m.remove());
    removeTooltip();
    updateBadge();
    refreshPanel();
    hidePopup();
  }

  // ── モードトグル ───────────────────────────────────────────
  function toggleMode() {
    isActive = !isActive;
    document.getElementById('agn-btn-toggle').classList.toggle('agn-active', isActive);
    document.body.classList.toggle('agn-mode', isActive);
    if (!isActive) { hideHighlight(); hidePopup(); removeTooltip(); }
  }

  // ── スクロール・リサイズ一括再計算 ─────────────────────────
  function onScrollOrResize() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      refreshAllMarkers();
      refreshPopup();
      refreshHighlight();
      // tooltip も追従
      if (tooltipEl) {
        const editing = document.querySelector('.agn-marker.agn-editing') ||
                        document.querySelector('.agn-marker:hover');
        if (editing) positionTooltip(editing);
      }
      rafId = null;
    });
  }

  // ── イベントバインド ───────────────────────────────────────
  function bindEvents() {
    // ツールバー
    document.getElementById('agn-btn-toggle').addEventListener('click', toggleMode);
    document.getElementById('agn-btn-list').addEventListener('click', togglePanel);

    const copyBtn = document.getElementById('agn-btn-copy');
    copyBtn.dataset.icon = '📋';
    copyBtn.addEventListener('click', () => copyToClipboard(generateMarkdown(), copyBtn));

    document.getElementById('agn-btn-clear').addEventListener('click', () => {
      if (!annotations.length) return;
      if (confirm(`${annotations.length}件のアノテーションを全て削除しますか？`)) clearAll();
    });

    // ポップアップ
    document.getElementById('agn-popup-close').addEventListener('click', hidePopup);
    document.getElementById('agn-btn-cancel').addEventListener('click', hidePopup);
    document.getElementById('agn-btn-add').addEventListener('click', commitAnnotation);
    document.getElementById('agn-btn-delete-ann').addEventListener('click', () => {
      if (editingId !== null) deleteAnnotation(editingId);
    });
    document.getElementById('agn-popup-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitAnnotation(); }
      if (e.key === 'Escape') hidePopup();
    });

    // 一覧パネル
    document.getElementById('agn-panel-close').addEventListener('click', togglePanel);
    const panelCopyBtn = document.getElementById('agn-panel-copy-btn');
    panelCopyBtn.dataset.icon = '📋 Markdownをコピー';
    panelCopyBtn.addEventListener('click', () => {
      copyToClipboard(generateMarkdown(), panelCopyBtn);
    });
    document.getElementById('agn-panel-clear-btn').addEventListener('click', () => {
      if (!annotations.length) return;
      if (confirm(`${annotations.length}件のアノテーションを全て削除しますか？`)) clearAll();
    });

    // キーボードショートカット
    document.addEventListener('keydown', e => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); toggleMode(); }
      if (e.key === 'Escape' && isActive) {
        document.getElementById('agn-popup').classList.contains('agn-show')
          ? hidePopup() : toggleMode();
      }
    });

    // ホバー・クリック（キャプチャフェーズ）
    document.addEventListener('mouseover', e => {
      if (!isActive) return;
      const t = e.target;
      if (t.closest('#agn-toolbar') || t.closest('#agn-popup') ||
          t.closest('#agn-panel')   || t.closest('.agn-marker')) return;
      showHighlight(t);
    }, true);

    document.addEventListener('mouseout', e => {
      if (!isActive) return;
      if (e.target.closest('#agn-toolbar') || e.target.closest('#agn-popup') ||
          e.target.closest('#agn-panel')) return;
      hideHighlight();
    }, true);

    document.addEventListener('click', e => {
      if (!isActive) return;
      const t = e.target;
      if (t.closest('#agn-toolbar') || t.closest('#agn-popup') ||
          t.closest('#agn-panel')   || t.closest('.agn-marker')) return;
      e.preventDefault();
      e.stopPropagation();
      hidePopup();
      openNewPopup(t);
    }, true);

    // スクロール・リサイズ
    window.addEventListener('scroll',  onScrollOrResize, { passive: true });
    window.addEventListener('resize',  onScrollOrResize, { passive: true });
  }

  // ── 初期化 ─────────────────────────────────────────────────
  function init() {
    buildUI();
    bindEvents();
    console.log('[agentation.js] v3 準備完了 | 📌 右下ボタン or [A]キーでモードON');
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
