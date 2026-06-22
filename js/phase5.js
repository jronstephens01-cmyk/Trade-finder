// phase5.js — Live Options Data + Paper Trade Validation System

const Phase5 = {

  VALIDATION_KEY: 'atis_phase5Validation',
  PAPER_OPTIONS_KEY: 'atis_paperOptions',

  // ============================================================
  // LIVE OPTIONS CHAIN FETCHER
  // ============================================================
  async fetchLiveOptionsChain(ticker, targetStrike, targetExpiry, workerUrl) {
    try {
      const res = await fetch(`${workerUrl}/api/options-chain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker })
      });

      if (!res.ok) throw new Error(`Options chain fetch failed: ${res.status}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      // Find the best matching call contract
      const calls = data.calls || [];
      const puts  = data.puts  || [];

      // Find closest strike to target
      const findBestContract = (contracts, strike, expiry) => {
        if (!contracts.length) return null;

        // Filter by expiry if provided
        let filtered = expiry
          ? contracts.filter(c => c.expiry === expiry)
          : contracts;

        if (!filtered.length) filtered = contracts;

        // Find closest strike
        filtered.sort((a, b) =>
          Math.abs(a.strike - strike) - Math.abs(b.strike - strike)
        );

        return filtered[0] || null;
      };

      const bestCall = findBestContract(calls, targetStrike || data.underlyingPrice, targetExpiry);
      const bestPut  = findBestContract(puts,  targetStrike || data.underlyingPrice, targetExpiry);

      return {
        ticker,
        underlyingPrice: data.underlyingPrice,
        bestCall,
        bestPut,
        allCalls: calls,
        allPuts: puts,
        expirations: data.expirations || [],
        timestamp: Date.now(),
        source: 'live'
      };

    } catch (err) {
      console.warn(`Live options fetch failed for ${ticker}:`, err.message);
      return null;
    }
  },

  // Extract real premium from live chain
  getRealPremium(contract) {
    if (!contract) return null;
    // Use midpoint of bid/ask for realistic fill price
    const bid = contract.bid || 0;
    const ask = contract.ask || contract.lastPrice || 0;
    if (bid && ask) return Utils.round((bid + ask) / 2, 2);
    return contract.lastPrice || null;
  },

  // Check if live contract meets liquidity requirements
  checkLiquidity(contract) {
    if (!contract) return { ok: false, flags: ['No contract data'] };
    const oi = contract.openInterest || 0;
    const bid = contract.bid || 0;
    const ask = contract.ask || 0;
    const spread = ask > 0 ? (ask - bid) / ask : 1;

    const flags = [];
    if (oi < 500) flags.push(`Low OI: ${oi.toLocaleString()} (min 500)`);
    if (spread > 0.05) flags.push(`Wide spread: ${Utils.round(spread * 100, 1)}% (max 5%)`);

    return { ok: flags.length === 0, flags, oi, spread: Utils.round(spread * 100, 2) };
  },

  // Format contract for display
  formatContract(contract, type) {
    if (!contract) return null;
    const premium = Phase5.getRealPremium(contract);
    const liquidity = Phase5.checkLiquidity(contract);

    return {
      type,
      strike: contract.strike,
      expiry: contract.expiry,
      bid: contract.bid,
      ask: contract.ask,
      premium,
      iv: contract.impliedVolatility ? Utils.round(contract.impliedVolatility * 100, 1) : null,
      openInterest: contract.openInterest,
      volume: contract.volume,
      delta: contract.delta || null,
      inTheMoney: contract.inTheMoney,
      liquidityOk: liquidity.ok,
      liquidityFlags: liquidity.flags,
      costPerContract: premium ? Utils.round(premium * 100, 2) : null,
      source: 'live'
    };
  },

  // ============================================================
  // PAPER OPTIONS TRADE LOGGER
  // ============================================================
  logPaperOptionsTrade(params) {
    const {
      ticker, type, strike, expiry,
      entryPremium, contracts, totalCost,
      stopPremium, targetPremium,
      thesis, score, scanId,
      marketRegime, iv, openInterest
    } = params;

    const tradeId = `PO-${String(Phase5.getPaperTrades().length + 1).padStart(3, '0')}`;
    const breakeven = type === 'call'
      ? Utils.round(strike + entryPremium, 2)
      : Utils.round(strike - entryPremium, 2);

    const trade = {
      tradeId,
      scanId,
      ticker: ticker.toUpperCase(),
      type,
      strike,
      expiry,
      contracts: contracts || 1,
      entryPremium,
      currentPremium: entryPremium,
      totalCost: totalCost || Utils.round(entryPremium * 100 * (contracts || 1), 2),
      stopPremium: stopPremium || Utils.round(entryPremium * 0.5, 2),
      targetPremium: targetPremium || Utils.round(entryPremium * 2.0, 2),
      breakeven,
      thesis: thesis || '',
      score: score || null,
      marketRegime: marketRegime || '—',
      iv: iv || null,
      openInterest: openInterest || null,
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
      // Phase 5 validation fields
      aiPredictedTarget: targetPremium,
      aiPredictedStop: stopPremium,
      aiScore: score,
      validationStatus: 'pending'
    };

    const trades = Phase5.getPaperTrades();
    trades.unshift(trade);
    Storage.set(Phase5.PAPER_OPTIONS_KEY, trades);

    // Update validation tracker
    Phase5.updateValidation(trade);

    Utils.toast(`📋 Paper trade auto-logged: ${ticker} ${type.toUpperCase()} $${strike} ${expiry}`, 'success');
    return trade;
  },

  getPaperTrades() {
    return Storage.get(Phase5.PAPER_OPTIONS_KEY) || [];
  },

  closePaperTrade(tradeId, exitPremium, exitReason = 'manual', lessons = '') {
    const trades = Phase5.getPaperTrades();
    const idx = trades.findIndex(t => t.tradeId === tradeId);
    if (idx === -1) return null;

    const trade = trades[idx];
    const realizedPL = Utils.round((exitPremium - trade.entryPremium) * 100 * trade.contracts, 2);
    const realizedPLPct = Utils.round((realizedPL / trade.totalCost) * 100, 2);

    trade.exitPremium    = exitPremium;
    trade.realizedPL     = realizedPL;
    trade.realizedPLPct  = realizedPLPct;
    trade.result         = realizedPL >= 0 ? 'win' : 'loss';
    trade.exitReason     = exitReason;
    trade.closeDate      = new Date().toISOString().split('T')[0];
    trade.lessons        = lessons;
    trade.status         = 'closed';
    trade.validationStatus = realizedPL >= 0 ? 'validated_win' : 'validated_loss';

    trades[idx] = trade;
    Storage.set(Phase5.PAPER_OPTIONS_KEY, trades);

    Phase5.updateValidationOnClose(trade);
    return trade;
  },

  // ============================================================
  // VALIDATION SYSTEM
  // ============================================================
  getValidation() {
    return Storage.get(Phase5.VALIDATION_KEY) || Phase5.defaultValidation();
  },

  defaultValidation() {
    return {
      startDate: new Date().toISOString().split('T')[0],
      phase: 'active',
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      profitFactor: 0,
      totalPL: 0,
      maxDrawdown: 0,
      ruleViolations: 0,
      checkpoints: {
        day30:  { reached: false, date: null, report: null },
        day60:  { reached: false, date: null, report: null },
        day90:  { reached: false, date: null, report: null }
      },
      requirements: {
        minTrades:       { required: 20,   current: 0,    met: false },
        minWinRate:      { required: 45,   current: 0,    met: false },
        minProfitFactor: { required: 1.3,  current: 0,    met: false },
        noViolations:    { required: true, current: true, met: true  },
        minDays:         { required: 90,   current: 0,    met: false }
      },
      phase6Unlocked: false,
      lastUpdated: Date.now()
    };
  },

  updateValidation(trade) {
    const v = Phase5.getValidation();
    v.totalTrades++;
    v.requirements.minTrades.current = v.totalTrades;
    v.requirements.minTrades.met = v.totalTrades >= 20;
    v.lastUpdated = Date.now();

    // Check day checkpoints
    const daysSinceStart = Math.floor(
      (Date.now() - new Date(v.startDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    v.requirements.minDays.current = daysSinceStart;
    v.requirements.minDays.met = daysSinceStart >= 90;

    if (daysSinceStart >= 30 && !v.checkpoints.day30.reached) {
      v.checkpoints.day30.reached = true;
      v.checkpoints.day30.date = new Date().toISOString().split('T')[0];
    }
    if (daysSinceStart >= 60 && !v.checkpoints.day60.reached) {
      v.checkpoints.day60.reached = true;
      v.checkpoints.day60.date = new Date().toISOString().split('T')[0];
    }
    if (daysSinceStart >= 90 && !v.checkpoints.day90.reached) {
      v.checkpoints.day90.reached = true;
      v.checkpoints.day90.date = new Date().toISOString().split('T')[0];
    }

    Storage.set(Phase5.VALIDATION_KEY, v);
  },

  updateValidationOnClose(trade) {
    const v = Phase5.getValidation();
    const trades = Phase5.getPaperTrades().filter(t => t.status === 'closed');

    const wins   = trades.filter(t => t.result === 'win');
    const losses = trades.filter(t => t.result === 'loss');

    v.wins   = wins.length;
    v.losses = losses.length;
    v.winRate = trades.length ? Utils.round((wins.length / trades.length) * 100, 1) : 0;

    const grossWin  = wins.reduce((s, t) => s + Math.abs(t.realizedPL || 0), 0);
    const grossLoss = losses.reduce((s, t) => s + Math.abs(t.realizedPL || 0), 0);
    v.profitFactor = grossLoss > 0 ? Utils.round(grossWin / grossLoss, 2) : 0;
    v.totalPL = Utils.round(trades.reduce((s, t) => s + (t.realizedPL || 0), 0), 2);

    // Update requirements
    v.requirements.minWinRate.current = v.winRate;
    v.requirements.minWinRate.met = v.winRate >= 45;
    v.requirements.minProfitFactor.current = v.profitFactor;
    v.requirements.minProfitFactor.met = v.profitFactor >= 1.3;

    // Check if Phase 6 unlocked
    const allMet = Object.values(v.requirements).every(r => r.met);
    if (allMet && !v.phase6Unlocked) {
      v.phase6Unlocked = true;
      Utils.toast('🎉 Phase 6 unlocked! All validation requirements met.', 'success');
    }

    v.lastUpdated = Date.now();
    Storage.set(Phase5.VALIDATION_KEY, v);
    return v;
  },

  // Get days elapsed since validation start
  getDaysElapsed() {
    const v = Phase5.getValidation();
    return Math.floor(
      (Date.now() - new Date(v.startDate).getTime()) / (1000 * 60 * 60 * 24)
    );
  },

  // Generate validation progress report
  getProgressReport() {
    const v = Phase5.getValidation();
    const trades = Phase5.getPaperTrades();
    const closed = trades.filter(t => t.status === 'closed');
    const days = Phase5.getDaysElapsed();

    return {
      daysElapsed: days,
      daysRemaining: Math.max(0, 90 - days),
      totalTrades: trades.length,
      closedTrades: closed.length,
      openTrades: trades.filter(t => t.status === 'open').length,
      winRate: v.winRate,
      profitFactor: v.profitFactor,
      totalPL: v.totalPL,
      requirements: v.requirements,
      checkpoints: v.checkpoints,
      phase6Unlocked: v.phase6Unlocked,
      readyForPhase6: Object.values(v.requirements).every(r => r.met)
    };
  }
};
