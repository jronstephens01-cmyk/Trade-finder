// app.js — Application entry point and tab router for ATIS

const App = {

  currentTab: 'market',

  init() {
    // ALWAYS reset pipeline state on page load
    try {
      if (typeof Pipeline !== 'undefined') {
        Pipeline.state.running      = false;
        Pipeline.state.error        = null;
        Pipeline.state.currentAgent = null;
      }
    } catch(e) { console.warn('Pipeline reset error:', e); }

    App.initTabs();
    App.startClock();
    App.initModules();
    App.checkEmergencyState();
    App.loadInitialTab();

    console.log('%cATIS v1.0 — Phase 5 Live', 'color:#00d4ff;font-weight:bold;font-size:14px');
  },

  initTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => App.switchTab(tab.dataset.tab));
    });
  },

  switchTab(tabId) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    const tab   = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
    const panel = document.getElementById(`tab-${tabId}`);
    if (tab)   tab.classList.add('active');
    if (panel) panel.classList.add('active');

    App.currentTab = tabId;
    history.replaceState(null, '', `#${tabId}`);

    switch (tabId) {
      case 'market':     Dashboard.renderFromCache(); break;
      case 'watchlist':  Watchlist.render(); break;
      case 'macro':      Macro.renderFromCache(); break;
      case 'portfolio':  Portfolio.render(); break;
      case 'journal':    Journal.render(); break;
      case 'phase5':     Phase5UI.render(); break;
      case 'agents':
        Agents.renderHealth();
        Agents.updateCostEstimate();
        break;
      case 'reports':
        const activeReport = document.querySelector('.tab-sub[data-report].active');
        if (activeReport) Reports.render(activeReport.dataset.report);
        break;
    }
  },

  loadInitialTab() {
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['market','watchlist','macro','scanner','portfolio',
                       'journal','reports','backtest','phase5','agents'];
    App.switchTab(validTabs.includes(hash) ? hash : 'market');
  },

  startClock() {
    const update = () => {
      const now = new Date();
      Utils.setText('systemTime', now.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      }));
    };
    update();
    setInterval(update, 1000);
  },

  checkEmergencyState() {
    try {
      const portfolio = Storage.getPortfolio();
      const riskState = Storage.getRiskState();
      if (riskState.hardFloorBreached || portfolio.currentValue <= 250) {
        Utils.show('emergencyBanner');
      }
    } catch(e) {}
  },

  initModules() {
    const modules = [
      { name: 'Dashboard',     fn: () => Dashboard.init() },
      { name: 'Watchlist',     fn: () => Watchlist.init() },
      { name: 'Macro',         fn: () => Macro.init() },
      { name: 'Portfolio',     fn: () => Portfolio.init() },
      { name: 'Journal',       fn: () => Journal.init() },
      { name: 'Reports',       fn: () => Reports.init() },
      { name: 'Agents',        fn: () => Agents.init() },
      { name: 'Scanner',       fn: () => Scanner.init() },
      { name: 'OptionsScanner',fn: () => OptionsScanner.init() },
      { name: 'BacktestUI',    fn: () => BacktestUI.init() },
      { name: 'Phase5UI',      fn: () => Phase5UI.init() },
    ];

    modules.forEach(({ name, fn }) => {
      try {
        fn();
      } catch(e) {
        console.error(`Failed to init ${name}:`, e);
      }
    });
  },

  startBackgroundTasks() {
    setInterval(() => {
      if (App.currentTab === 'agents') {
        try { Agents.renderHealth(); } catch(e) {}
      }
      try { Storage.cleanup(); } catch(e) {}
      try { App.checkEmergencyState(); } catch(e) {}
    }, 5 * 60 * 1000);
  },

  // Emergency pipeline reset — callable from console
  resetPipeline() {
    try {
      Pipeline.state.running      = false;
      Pipeline.state.error        = null;
      Pipeline.state.currentAgent = null;
      AgentUI.resetPipeline();
      Utils.toast('Pipeline reset', 'success');
      console.log('Pipeline reset complete');
    } catch(e) {
      console.error('Reset failed:', e);
    }
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  App.startBackgroundTasks();
});

window.addEventListener('popstate', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash) App.switchTab(hash);
});
