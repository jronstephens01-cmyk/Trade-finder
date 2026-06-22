// utils.js — Shared utilities for ATIS

const Utils = {

  // --- FORMATTERS ---

  formatCurrency(value, decimals = 2) {
    if (value == null || isNaN(value)) return '$0.00';
    const abs = Math.abs(value);
    const formatted = abs.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (value < 0 ? '-$' : '$') + formatted;
  },

  formatPercent(value, decimals = 2, showPlus = true) {
    if (value == null || isNaN(value)) return '—%';
    const sign = value > 0 && showPlus ? '+' : '';
    return `${sign}${parseFloat(value).toFixed(decimals)}%`;
  },

  formatPnL(value) {
    if (value == null || isNaN(value)) return { text: '$0.00', cls: '' };
    return {
      text: (value >= 0 ? '+' : '') + Utils.formatCurrency(value),
      cls: value >= 0 ? 'positive' : 'negative'
    };
  },

  formatChange(value) {
    if (value == null || isNaN(value)) return { text: '—%', cls: '' };
    return {
      text: Utils.formatPercent(value),
      cls: value >= 0 ? 'positive' : 'negative'
    };
  },

  formatTime(date) {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  },

  formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  },

  formatDateShort(date) {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'numeric', day: 'numeric'
    });
  },

  formatVolume(value) {
    if (!value) return '—';
    if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B';
    if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (value >= 1e3) return (value / 1e3).toFixed(0) + 'K';
    return value.toString();
  },

  formatScore(score, max = 60) {
    if (score == null) return '—';
    return `${score}/${max}`;
  },

  // --- IDs ---

  generateScanId() {
    const existing = Storage.get(STORAGE_KEYS.SCAN_LOG) || [];
    return `S-${String(existing.length + 1).padStart(3, '0')}`;
  },

  generateTradeId() {
    const existing = Storage.get(STORAGE_KEYS.TRADE_LOG) || [];
    return `T-${String(existing.length + 1).padStart(3, '0')}`;
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },

  // --- MATH ---

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  round(value, decimals = 2) {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  },

  pctChange(from, to) {
    if (!from || from === 0) return 0;
    return ((to - from) / Math.abs(from)) * 100;
  },

  // --- DOM ---

  el(id) {
    return document.getElementById(id);
  },

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  },

  setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  },

  addClass(id, cls) {
    const el = document.getElementById(id);
    if (el) el.classList.add(cls);
  },

  removeClass(id, cls) {
    const el = document.getElementById(id);
    if (el) el.classList.remove(cls);
  },

  setClass(id, cls, condition) {
    const el = document.getElementById(id);
    if (!el) return;
    if (condition) el.classList.add(cls);
    else el.classList.remove(cls);
  },

  setStyle(id, prop, value) {
    const el = document.getElementById(id);
    if (el) el.style[prop] = value;
  },

  show(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  },

  hide(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },

  // --- TOAST ---

  toast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    clearTimeout(Utils._toastTimer);
    Utils._toastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, duration);
  },

  // --- DATA HELPERS ---

  isStale(timestamp, maxAgeMs = 60 * 60 * 1000) {
    if (!timestamp) return true;
    return Date.now() - timestamp > maxAgeMs;
  },

  freshness(timestamp) {
    if (!timestamp) return 'Never loaded';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return Utils.formatDate(timestamp);
  },

  // --- SCORE CLASSIFICATION ---

  scoreLabel(score) {
    if (score >= 50) return { text: 'HIGH CONVICTION', cls: 'positive' };
    if (score >= 42) return { text: 'QUALIFIED', cls: '' };
    if (score >= 35) return { text: 'MONITOR', cls: '' };
    return { text: 'REJECT', cls: 'negative' };
  },

  regimeClass(regime) {
    if (!regime) return '';
    const r = regime.toLowerCase();
    if (r.includes('on')) return 'risk-on';
    if (r.includes('off')) return 'risk-off';
    return 'neutral';
  },

  // --- STORAGE SIZE ---

  getStorageSizeKB() {
    let total = 0;
    for (let key of Object.keys(localStorage)) {
      if (key.startsWith('atis_')) {
        total += localStorage.getItem(key).length;
      }
    }
    return Math.round(total / 1024);
  },

  // --- SECTOR MAP ---

  SECTORS: {
    XLK: 'Technology',
    XLF: 'Financials',
    XLE: 'Energy',
    XLV: 'Healthcare',
    XLI: 'Industrials',
    XLY: 'Consumer Disc.',
    XLP: 'Consumer Staples',
    XLU: 'Utilities',
    XLRE: 'Real Estate',
    XLB: 'Materials',
    XLC: 'Comm. Services',
  },

  SECTOR_ETFS: ['XLK','XLF','XLE','XLV','XLI','XLY','XLP','XLU','XLRE','XLB','XLC'],
  INDEX_TICKERS: ['SPY','QQQ','IWM','^VIX'],
};
