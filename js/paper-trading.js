// paper-trading.js — Paper Trading Engine for ATIS Phase 2

const PaperTrading = {

  STORAGE_KEY: 'atis_paperTrades',
  PORTFOLIO_KEY: 'atis_paperPortfolio',

  // Default paper portfolio
  defaultPaperPortfolio() {
    return {
      startingCapital: 10000.00,  // Paper money — separate from real account
      currentValue: 10000.00,
      cashAvailable: 10000.00,
      peakValue: 10000.00,
      positions: [],
      totalRealizedPL: 0,
      lastUpdated: null
    };
  },

  getPaperPortfolio() {
    return Storage.get(PaperTrading.PORTFOLIO_KEY) || PaperTrading.defaultPaperPortfolio();
  },

  savePaperPortfolio(portfolio) {
    portfolio.lastUpdated = Date.now();
    Storage.set(PaperTrading.PORTFOLIO_KEY, portfolio);
  },

  getPaperTrades() {
    return Storage.get(PaperTrading.STORAGE_KEY) || [];
  },

  // Open a new paper options trade
  openTrade(params) {
    const {
      ticker, type, strike, expiry,
      contracts, premium, delta, iv,
      thesis, stopLoss, target, score
    } = params;

    const totalCost = Utils.round(premium * 100 * contracts, 2);
    const portfolio = PaperTrading.getPaperPortfolio();

    if (totalCost > portfolio.cashAvailable) {
      return { success: false, error: `Insufficient paper cash. Need ${Utils.formatCurrency(totalCost)}, have ${Utils.formatCurrency(portfolio.cashAvailable)}` };
    }

    const tradeId = `P-${String(PaperTrading.getPaperTrades().length + 1).padStart(3, '0')}`;
    const breakeven = type === 'call'
      ? Utils.round(strike + premium, 2)
      : Utils.round(strike - premium, 2);

    const trade = {
      tradeId,
      ticker: ticker.toUpperCase(),
      type,           // 'call' or 'put'
      strike,
      expiry,
      contracts,
      entryPremium: premium,
      currentPremium: premium,
      delta: delta || null,
      iv: iv || null,
      totalCost,
      breakeven,
      stopLoss: stopLoss || null,
      target: target || null,
      thesis: thesis || '',
      score: score || null,
      status: 'open',
      openDate: new Date().toISOString().split('T')[0],
      openTimestamp: Date.now(),
      closeDate: null,
      exitPremium: null,
      realizedPL: null,
      realizedPLPct: null,
      result: null,
      exitReason: null,
      lessons: '',
      marketRegime: Storage.getCachedMacroState()?.regime || '—',
    };

    // Deduct cost from paper portfolio
    portfolio.cashAvailable = Utils.round(portfolio.cashAvailable - totalCost, 2);
    portfolio.positions.push(trade);
    PaperTrading.savePaperPortfolio(portfolio);

    // Save to trade log
    const trades = PaperTrading.getPaperTrades();
    trades.unshift(trade);
    Storage.set(PaperTrading.STORAGE_KEY, trades);

    return { success: true, trade };
  },

  // Close a paper trade
  closeTrade(tradeId, exitPremium, exitReason = 'manual', lessons = '') {
    const trades = PaperTrading.getPaperTrades();
    const idx = trades.findIndex(t => t.tradeId === tradeId);
    if (idx === -1) return { success: false, error: 'Trade not found' };

    const trade = trades[idx];
    if (trade.status !== 'open') return { success: false, error: 'Trade already closed' };

    const proceeds = Utils.round(exitPremium * 100 * trade.contracts, 2);
    const realizedPL = Utils.round(proceeds - trade.totalCost, 2);
    const realizedPLPct = Utils.round((realizedPL / trade.totalCost) * 100, 2);

    trade.exitPremium = exitPremium;
    trade.realizedPL = realizedPL;
    trade.realizedPLPct = realizedPLPct;
    trade.result = realizedPL >= 0 ? 'win' : 'loss';
    trade.exitReason = exitReason;
    trade.closeDate = new Date().toISOString().split('T')[0];
    trade.lessons = lessons;
    trade.status = 'closed';
    trade.currentPremium = exitPremium;

    trades[idx] = trade;
    Storage.set(PaperTrading.STORAGE_KEY, trades);

    // Update paper portfolio
    const portfolio = PaperTrading.getPaperPortfolio();
    portfolio.cashAvailable = Utils.round(portfolio.cashAvailable + proceeds, 2);
    portfolio.totalRealizedPL = Utils.round(portfolio.totalRealizedPL + realizedPL, 2);
    portfolio.positions = portfolio.positions.filter(p => p.tradeId !== tradeId);
    portfolio.currentValue = Utils.round(portfolio.cashAvailable + PaperTrading.openPositionsValue(portfolio.positions), 2);
    if (portfolio.currentValue > portfolio.peakValue) portfolio.peakValue = portfolio.currentValue;
    PaperTrading.savePaperPortfolio(portfolio);

    return { success: true, trade, realizedPL, realizedPLPct };
  },

  // Update current premium for open positions (called on price refresh)
  updatePosition(tradeId, currentPremium) {
    const portfolio = PaperTrading.getPaperPortfolio();
    const pos = portfolio.positions.find(p => p.tradeId === tradeId);
    if (pos) {
      pos.currentPremium = currentPremium;
      const unrealizedPL = Utils.round((currentPremium - pos.entryPremium) * 100 * pos.contracts, 2);
      pos.unrealizedPL = unrealizedPL;
      pos.unrealizedPLPct = Utils.round((unrealizedPL / pos.totalCost) * 100, 2);
    }
    portfolio.currentValue = Utils.round(
      portfolio.cashAvailable + PaperTrading.openPositionsValue(portfolio.positions), 2
    );
    PaperTrading.savePaperPortfolio(portfolio);
  },

  openPositionsValue(positions) {
    return positions.reduce((sum, p) => {
      const val = (p.currentPremium || p.entryPremium) * 100 * p.contracts;
      return sum + val;
    }, 0);
  },

  // Calculate paper trading performance stats
  getStats() {
    const trades = PaperTrading.getPaperTrades().filter(t => t.status === 'closed');
    const portfolio = PaperTrading.getPaperPortfolio();

    if (!trades.length) return {
      totalTrades: 0, wins: 0, losses: 0,
      winRate: 0, avgWin: 0, avgLoss: 0,
      profitFactor: 0, expectancy: 0,
      totalPL: 0, totalPLPct: 0
    };

    const wins   = trades.filter(t => t.result === 'win');
    const losses = trades.filter(t => t.result === 'loss');

    const avgWin  = wins.length   ? wins.reduce((s, t) => s + t.realizedPLPct, 0) / wins.length   : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.realizedPLPct, 0) / losses.length) : 0;

    const grossWin  = wins.length   * Math.abs(avgWin);
    const grossLoss = losses.length * avgLoss;
    const profitFactor = grossLoss > 0 ? Utils.round(grossWin / grossLoss, 2) : 0;
    const winRate = trades.length ? Utils.round(wins.length / trades.length, 4) : 0;
    const expectancy = Utils.round(winRate * Math.abs(avgWin) - (1 - winRate) * avgLoss, 2);

    const totalPL = Utils.round(portfolio.totalRealizedPL, 2);
    const totalPLPct = Utils.round((totalPL / portfolio.startingCapital) * 100, 2);

    return {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: Utils.round(winRate * 100, 1),
      avgWin: Utils.round(avgWin, 2),
      avgLoss: Utils.round(avgLoss, 2),
      profitFactor,
      expectancy,
      totalPL,
      totalPLPct,
      openPositions: portfolio.positions.length
    };
  },

  // Check if any open positions hit stop or target
  checkAlerts(positions) {
    const alerts = [];
    for (const pos of positions) {
      if (!pos.currentPremium) continue;
      const currentVal = pos.currentPremium;

      if (pos.stopLoss && currentVal <= pos.stopLoss) {
        alerts.push({
          tradeId: pos.tradeId,
          ticker: pos.ticker,
          type: 'STOP',
          message: `${pos.ticker} ${pos.type.toUpperCase()} hit stop loss. Current: $${currentVal.toFixed(2)}, Stop: $${pos.stopLoss.toFixed(2)}`
        });
      }
      if (pos.target && currentVal >= pos.target) {
        alerts.push({
          tradeId: pos.tradeId,
          ticker: pos.ticker,
          type: 'TARGET',
          message: `${pos.ticker} ${pos.type.toUpperCase()} hit target! Current: $${currentVal.toFixed(2)}, Target: $${pos.target.toFixed(2)}`
        });
      }
    }
    return alerts;
  }
};
