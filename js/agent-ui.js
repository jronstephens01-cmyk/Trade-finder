// agent-ui.js — Pipeline UI and Approval Gate

const AgentUI = {

  currentScanId: null,
  _timer: null,
  _startTime: null,

  // ============================================================
  // PIPELINE START
  // ============================================================
  startPipeline(scanId) {
    AgentUI.currentScanId = scanId;
    AgentUI._startTime = Date.now();
    clearInterval(AgentUI._timer);

    const container = document.getElementById('pipelineContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="pipeline-header">
        <span class="pipeline-title">PIPELINE RUNNING</span>
        <span class="pipeline-scan-id">${scanId}</span>
        <span class="pipeline-time" id="pipelineTimer">0s</span>
      </div>
      <div class="pipeline-steps" id="pipelineSteps">
        ${AgentUI.renderStep('data',    '⬡', 'Data Ingestion',          'Fetching market + macro data')}
        ${AgentUI.renderStep('agent15', '15', 'Macro Strategist',        'Classifying market regime')}
        ${AgentUI.renderStep('agent1',  '01', 'Junior Analyst',          'Scanning watchlist')}
        ${AgentUI.renderStep('agent3',  '03', 'Sector Head',             'Filtering by sector strength')}
        ${AgentUI.renderStep('agent2',  '02', 'Research Analyst',        'Technical + fundamental analysis')}
        ${AgentUI.renderStep('agent4',  '04', 'Quant Researcher',        'Statistical validation')}
        ${AgentUI.renderStep('agent5',  '05', 'Risk Manager',            'Position sizing + risk check')}
        ${AgentUI.renderStep('agent14', '14', 'Chief Investment Officer','Generating recommendation')}
        ${AgentUI.renderStep('agent16', '16', 'Options Specialist',      'Live options analysis')}
        ${AgentUI.renderStep('agent6',  '06', 'Compliance Officer',      'Rule compliance check')}
        ${AgentUI.renderStep('agent7',  '07', 'Execution Specialist',    'Order structuring')}
        ${AgentUI.renderStep('agent17', '17', 'AI Strategy Director',    'Strategy review')}
      </div>
      <div id="approvalGate" style="display:none"></div>
    `;

    AgentUI._timer = setInterval(() => {
      const s = Math.floor((Date.now() - AgentUI._startTime) / 1000);
      const el = document.getElementById('pipelineTimer');
      if (el) el.textContent = `${s}s`;
    }, 1000);
  },

  renderStep(id, num, name, defaultStatus) {
    return `
      <div class="pipeline-step" id="step-${id}">
        <div class="step-num">${num}</div>
        <div class="step-body">
          <div class="step-name">${name}</div>
          <div class="step-status" id="status-${id}">${defaultStatus}</div>
        </div>
        <div class="step-indicator" id="indicator-${id}"></div>
      </div>
    `;
  },

  setAgentStatus(id, state, message) {
    const step      = document.getElementById(`step-${id}`);
    const statusEl  = document.getElementById(`status-${id}`);
    const indicator = document.getElementById(`indicator-${id}`);
    if (!step) return;

    step.className = `pipeline-step step--${state}`;
    if (statusEl)  statusEl.textContent = message || '';
    if (indicator) {
      if (state === 'complete')  indicator.innerHTML = '<span class="step-check">✓</span>';
      else if (state === 'rejected') indicator.innerHTML = '<span class="step-reject">✕</span>';
      else if (state === 'running')  indicator.innerHTML = '<span style="color:var(--amber);font-size:12px">●</span>';
      else indicator.innerHTML = '';
    }
  },

  showError(message) {
    clearInterval(AgentUI._timer);
    const gate = document.getElementById('approvalGate');
    if (gate) {
      gate.style.display = 'block';
      gate.innerHTML = `
        <div class="pipeline-error-block">
          <div class="pipeline-error-title">⚠ Pipeline Error</div>
          <div class="pipeline-error-msg">${message}</div>
          <div class="pipeline-error-hint">Check your Worker URL and Claude API key in Agents tab.</div>
          <button class="btn btn--secondary" style="margin-top:12px" onclick="AgentUI.resetPipeline()">↻ Try Again</button>
        </div>
      `;
    }
  },

  showPipelineComplete(reason) {
    clearInterval(AgentUI._timer);
    const msgs = {
      no_candidates: 'No candidates found in your watchlist today. Try again later or add more tickers.',
      filtered_out:  'All candidates were filtered out by sector analysis. Market conditions may be unfavorable.',
      risk_rejected: 'Setup rejected by Risk Manager. Capital preservation rules prevent this trade.',
    };
    const gate = document.getElementById('approvalGate');
    if (gate) {
      gate.style.display = 'block';
      gate.innerHTML = `
        <div class="pipeline-complete-block">
          <div class="complete-icon">◈</div>
          <div class="complete-title">Scan Complete</div>
          <div class="complete-msg">${msgs[reason] || 'Pipeline finished.'}</div>
          <button class="btn btn--secondary" onclick="AgentUI.resetPipeline()">↻ Run New Scan</button>
        </div>
      `;
    }
  },

  // ============================================================
  // APPROVAL GATE — Simple card anyone can understand
  // ============================================================
  showApprovalGate(cioResult, riskResult, candidate, quote) {
    clearInterval(AgentUI._timer);

    const gate = document.getElementById('approvalGate');
    if (!gate) return;

    const alert     = cioResult.tradeAlert || {};
    const scores    = cioResult.scores || {};
    const options   = Pipeline.state.results?.optionsAnalysis || {};
    const execution = Pipeline.state.results?.executionPlan || {};
    const isQualified = scores.total >= 42;

    // Decision label
    const decision = scores.total >= 42
      ? { emoji: '✅', label: 'BUY',   color: 'var(--green)', bg: 'rgba(0,230,118,0.08)', border: 'var(--green)' }
      : scores.total >= 35
      ? { emoji: '👀', label: 'WATCH', color: 'var(--amber)', bg: 'rgba(255,193,7,0.08)', border: 'var(--amber)' }
      : { emoji: '⏭️', label: 'SKIP',  color: 'var(--red)',   bg: 'rgba(255,61,87,0.08)', border: 'var(--red)'   };

    // One sentence why
    const rawThesis = alert.thesis || '';
    const sentences = rawThesis.match(/[^.!?]+[.!?]+/g) || [];
    const oneSentence = sentences[0]?.trim() || rawThesis.slice(0, 120);

    // Numbers
    const stockEntry  = alert.entryZone  || execution.limitPrice || '—';
    const stockStop   = alert.stopLoss   || execution.stopPrice  || '—';
    const stockTarget = alert.target     || execution.targetPrice || '—';
    const optStrike   = options.recommendedStrike || '—';
    const optExpiry   = options.recommendedExpiry || '—';
    const optPremium  = options.realPremium || options.estimatedPremium || null;
    const optCost     = optPremium ? `$${(optPremium * 100).toFixed(0)}` : '—';
    const optStop     = optPremium ? `$${(optPremium * 0.5).toFixed(2)}` : '—';
    const liveTag     = options.liveDataAvailable
      ? `<span style="font-size:10px;color:var(--green)">📡 LIVE</span>`
      : `<span style="font-size:10px;color:var(--amber)">est.</span>`;

    gate.style.display = 'block';
    gate.innerHTML = `
      <div style="border:2px solid ${decision.border};border-radius:12px;overflow:hidden;margin-top:16px;background:var(--bg-raised)">

        <!-- HEADER -->
        <div style="background:${decision.bg};border-bottom:1px solid ${decision.border};padding:16px 20px;display:flex;align-items:center;gap:14px">
          <div style="font-size:28px">${decision.emoji}</div>
          <div>
            <div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:${decision.color}">${decision.label}</div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">AI Score: ${scores.total}/60</div>
          </div>
          <div style="flex:1;text-align:right">
            <div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--text-primary)">${alert.ticker || candidate.ticker}</div>
            <div style="font-size:11px;color:var(--text-muted)">${alert.timeframe || '2-4 weeks'}</div>
          </div>
        </div>

        <!-- ONE SENTENCE WHY -->
        <div style="padding:12px 20px;background:var(--bg-surface);border-bottom:1px solid var(--border);font-size:13px;color:var(--text-secondary);line-height:1.5;font-style:italic">
          "${oneSentence}"
        </div>

        <!-- TWO COLUMN TRADE CARD -->
        <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--border)">

          <!-- STOCK PLAY -->
          <div style="padding:16px 18px;border-right:1px solid var(--border)">
            <div style="font-family:var(--font-mono);font-size:10px;font-weight:600;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:12px">📈 STOCK PLAY</div>

            <div style="margin-bottom:12px">
              <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px">BUY AT</div>
              <div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--cyan)">${stockEntry}</div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="padding:10px;background:rgba(255,61,87,0.06);border:1px solid var(--red-dim);border-radius:6px">
                <div style="font-size:9px;color:var(--red);font-family:var(--font-mono);margin-bottom:3px">🛑 STOP LOSS</div>
                <div style="font-family:var(--font-mono);font-size:15px;font-weight:700;color:var(--red)">${stockStop}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Sell if drops here</div>
              </div>
              <div style="padding:10px;background:rgba(0,230,118,0.06);border:1px solid var(--green-dim);border-radius:6px">
                <div style="font-size:9px;color:var(--green);font-family:var(--font-mono);margin-bottom:3px">🎯 TAKE PROFIT</div>
                <div style="font-family:var(--font-mono);font-size:15px;font-weight:700;color:var(--green)">${stockTarget}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Sell shares here</div>
              </div>
            </div>

            <div style="margin-top:8px;padding:7px 10px;background:var(--bg-surface);border-radius:4px;font-size:11px;color:var(--text-muted)">
              R/R: ${alert.riskReward || '—'} &nbsp;·&nbsp; Position: ${Utils.formatCurrency(riskResult.recommendedPositionDollar)}
            </div>
          </div>

          <!-- OPTIONS PLAY — Budget filter + 3 tiers -->
          <div style="padding:16px 18px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <div style="font-family:var(--font-mono);font-size:10px;font-weight:600;letter-spacing:0.1em;color:var(--text-muted)">🎯 OPTIONS PLAY ${liveTag}</div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:10px;color:var(--text-muted)">Max budget:</span>
                <select id="optBudgetFilter" onchange="AgentUI.filterOptionTiers()"
                  style="font-family:var(--font-mono);font-size:11px;background:var(--bg-surface);border:1px solid var(--border-bright);border-radius:4px;padding:3px 6px;color:var(--cyan);cursor:pointer">
                  <option value="99999">Any price</option>
                  <option value="200">Under $200</option>
                  <option value="500">Under $500</option>
                  <option value="1000">Under $1,000</option>
                  <option value="2000">Under $2,000</option>
                </select>
              </div>
            </div>

            <!-- Same stop/target for all tiers -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
              <div style="padding:8px;background:rgba(255,61,87,0.06);border:1px solid var(--red-dim);border-radius:6px;text-align:center">
                <div style="font-size:9px;color:var(--red);font-family:var(--font-mono);margin-bottom:2px">🛑 EXIT IF STOCK →</div>
                <div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--red)">${stockStop}</div>
                <div style="font-size:9px;color:var(--amber);margin-top:2px">⚡ Paid less? Stop = entry ÷ 2</div>
              </div>
              <div style="padding:8px;background:rgba(0,230,118,0.06);border:1px solid var(--green-dim);border-radius:6px;text-align:center">
                <div style="font-size:9px;color:var(--green);font-family:var(--font-mono);margin-bottom:2px">🎯 TAKE PROFIT STOCK →</div>
                <div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--green)">${stockTarget}</div>
                <div style="font-size:9px;color:var(--text-muted);margin-top:2px">Sell contract then</div>
              </div>
            </div>

            <!-- 3 Tier contracts -->
            <div id="optionTiers">
              ${AgentUI.renderOptionTiers(options, stockStop, stockTarget)}
            </div>
          </div>
        </div>

        <!-- SHOW DETAILS TOGGLE -->
        <div style="border-bottom:1px solid var(--border)">
          <button onclick="AgentUI.toggleDetails(this)" style="width:100%;padding:11px 20px;background:none;border:none;font-family:var(--font-mono);font-size:11px;color:var(--cyan);cursor:pointer;text-align:left;letter-spacing:0.06em">
            ▼ Show Details — full thesis, risks, score breakdown
          </button>
          <div id="tradeDetails" style="display:none;padding:0 20px 16px">
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:0.1em;margin-bottom:8px;margin-top:4px">AI SCORE — ${scores.total}/60</div>
            ${AgentUI.renderScoreBar('Technical',   scores.technical)}
            ${AgentUI.renderScoreBar('Fundamental', scores.fundamental)}
            ${AgentUI.renderScoreBar('Catalyst',    scores.catalyst)}
            ${AgentUI.renderScoreBar('Risk/Reward', scores.risk)}
            ${AgentUI.renderScoreBar('Market',      scores.market)}
            ${AgentUI.renderScoreBar('Macro',       scores.macro)}

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
              <div style="background:rgba(0,230,118,0.04);border:1px solid var(--green-dim);border-radius:6px;padding:12px">
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--green);margin-bottom:6px">✅ WHY THE AI LIKES THIS</div>
                <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">${alert.thesis || '—'}</div>
              </div>
              <div style="background:rgba(255,61,87,0.04);border:1px solid var(--red-dim);border-radius:6px;padding:12px">
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--red);margin-bottom:6px">⚠️ WHAT COULD GO WRONG</div>
                <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">${alert.risks || '—'}</div>
              </div>
            </div>
            <div style="background:rgba(255,193,7,0.05);border:1px solid var(--amber-dim);border-radius:6px;padding:12px;margin-top:10px">
              <div style="font-family:var(--font-mono);font-size:10px;color:var(--amber);margin-bottom:6px">🚪 WALK AWAY IF...</div>
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">${alert.invalidation || '—'}</div>
            </div>
            <div style="background:var(--bg-surface);border-radius:6px;padding:10px;margin-top:10px;font-size:11px;color:var(--text-muted)">
              <strong style="color:var(--text-secondary)">Best time to enter:</strong> ${execution.entryTiming || 'Avoid first 30 min of market open. Wait for price to settle.'}
            </div>
          </div>
        </div>

        <!-- BUTTONS -->
        <div style="padding:14px 20px;display:flex;gap:10px;justify-content:flex-end;align-items:center">
          ${!isQualified ? `<span style="font-family:var(--font-mono);font-size:11px;color:var(--amber);flex:1">Score ${scores.total}/60 — below 42 min. Consider watching.</span>` : ''}
          <button class="btn btn--danger" onclick="AgentUI.recordDecision('declined')">⏭️ Skip</button>
          <button class="btn btn--secondary" onclick="AgentUI.recordDecision('watch')">👀 Watch</button>
          <button class="btn btn--primary" onclick="AgentUI.recordDecision('approved')"
            style="${!isQualified ? 'opacity:0.6' : ''}">✅ Log Trade</button>
        </div>

      </div>
    `;
  },

  toggleDetails(btn) {
    const el = document.getElementById('tradeDetails');
    if (!el) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    if (btn) btn.innerHTML = isHidden
      ? '▲ Hide Details'
      : '▼ Show Details — full thesis, risks, score breakdown';
  },

  // Build 3 tier option cards from live chain data
  renderOptionTiers(options, stockStop, stockTarget, maxBudget = 99999) {
    const allCalls = Pipeline.state.results?.optionsRawCalls || [];

    if (!allCalls.length) {
      const premium = options.realPremium || options.estimatedPremium;
      const cost    = premium ? (premium * 100) : null;
      if (!premium) return `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:12px">No live options data available</div>`;
      return AgentUI.renderSingleTier('🟡', 'STANDARD', options.recommendedStrike, options.recommendedExpiry, cost, premium, options.realBid, options.realAsk, options.probabilityOfProfit, maxBudget);
    }

    const underlying = options.underlyingPrice || 0;
    const sorted     = [...allCalls].filter(c => (c.mark || c.ask || 0) > 0).sort((a, b) => a.strike - b.strike);
    if (!sorted.length) return `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:12px">No liquid contracts found</div>`;

    // Find ATM index
    const atmIdx = sorted.reduce((best, c, i) =>
      Math.abs(c.strike - underlying) < Math.abs(sorted[best].strike - underlying) ? i : best, 0);

    // Pick 3 distinct tiers
    const conservative = sorted[Math.max(0, atmIdx - 1)];
    const standard     = sorted[atmIdx];
    const aggressive   = sorted[Math.min(sorted.length - 1, atmIdx + 2)];

    const seen = new Set();
    const tiers = [
      { emoji: '🟢', label: 'CONSERVATIVE', contract: conservative },
      { emoji: '🟡', label: 'STANDARD',     contract: standard     },
      { emoji: '🔴', label: 'AGGRESSIVE',   contract: aggressive   },
    ].filter(t => {
      if (!t.contract || seen.has(t.contract.strike)) return false;
      seen.add(t.contract.strike);
      return true;
    });

    return tiers.map(t => {
      const mark = t.contract.mark || ((t.contract.bid + t.contract.ask) / 2) || 0;
      const cost = mark * 100;
      return AgentUI.renderSingleTier(t.emoji, t.label, t.contract.strike, t.contract.expiry, cost, mark, t.contract.bid, t.contract.ask, t.contract.probabilityOfProfit, maxBudget);
    }).join('');
  },

  renderSingleTier(emoji, label, strike, expiry, cost, premium, bid, ask, winOdds, maxBudget) {
    const affordable = cost <= maxBudget;
    const opacity    = affordable ? '1' : '0.35';
    const border     = label === 'CONSERVATIVE' ? 'var(--green-dim)' : label === 'STANDARD' ? 'var(--cyan-dim)' : 'var(--amber-dim)';
    const color      = label === 'CONSERVATIVE' ? 'var(--green)' : label === 'STANDARD' ? 'var(--cyan)' : 'var(--amber)';

    return `
      <div style="opacity:${opacity};margin-bottom:8px;padding:10px;background:var(--bg-surface);border:1px solid ${border};border-radius:6px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:12px">${emoji}</span>
          <span style="font-family:var(--font-mono);font-size:9px;font-weight:600;color:${color};letter-spacing:0.08em">${label}</span>
          ${!affordable ? `<span style="font-family:var(--font-mono);font-size:9px;color:var(--red)">OVER BUDGET</span>` : ''}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div>
            <div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text-primary)">$${strike} Call — ${expiry}</div>
            ${bid && ask ? `<div style="font-size:10px;color:var(--text-muted)">Bid $${bid} / Ask $${ask}</div>` : ''}
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:${color}">$${cost ? cost.toFixed(0) : '—'}</div>
            <div style="font-size:9px;color:var(--text-muted)">per contract</div>
          </div>
        </div>
        ${winOdds ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px">Win odds: ${Math.round(winOdds * 100)}%</div>` : ''}
      </div>
    `;
  },

  filterOptionTiers() {
    const budget  = parseInt(document.getElementById('optBudgetFilter')?.value || '99999');
    const options = Pipeline.state.results?.optionsAnalysis || {};
    const alert   = Pipeline.state.results?.finalRecommendation?.tradeAlert || {};
    const stockStop   = alert.stopLoss   || '—';
    const stockTarget = alert.target     || '—';
    const el = document.getElementById('optionTiers');
    if (el) el.innerHTML = AgentUI.renderOptionTiers(options, stockStop, stockTarget, budget);
  },

  renderScoreBar(label, score) {
    const pct   = ((score || 0) / 10) * 100;
    const color = score >= 7 ? 'var(--green)' : score >= 5 ? 'var(--cyan)' : score >= 3 ? 'var(--amber)' : 'var(--red)';
    return `
      <div class="approval-score-row">
        <span class="approval-score-label">${label}</span>
        <div class="approval-score-bar-wrap">
          <div class="approval-score-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="approval-score-num">${score || 0}/10</span>
      </div>
    `;
  },

  recordDecision(decision) {
    const results = Pipeline.state.results;
    if (!results) return;

    const alert     = results.finalRecommendation?.tradeAlert;
    const scores    = results.finalRecommendation?.scores;
    const options   = results.optionsAnalysis || {};
    const execution = results.executionPlan || {};

    if (decision !== 'watch') {
      Pipeline.recordDecision(AgentUI.currentScanId, decision, alert ? {
        ...alert,
        totalScore:        scores?.total,
        optionsStrategy:   options.recommendedStrategy,
        optionsStrike:     options.recommendedStrike,
        optionsExpiry:     options.recommendedExpiry,
        optionsPremium:    options.estimatedPremium,
        optionsContracts:  execution.contracts,
        executionLimit:    execution.limitPrice,
        executionStop:     execution.stopPrice,
        executionTarget:   execution.targetPrice,
        orderInstructions: execution.orderInstructions
      } : null);
    }

    const icons  = { approved: '✅', watch: '👀', declined: '⏭️' };
    const titles = { approved: 'Logged to Journal', watch: 'Added to Watch List', declined: 'Skipped' };
    const msgs   = {
      approved: `Go to Robinhood and place the order. ${options.recommendedStrategy?.replace('_',' ') || ''} $${options.recommendedStrike} exp ${options.recommendedExpiry}. Stock stop: ${alert?.stopLoss} | Premium stop: ${options.estimatedPremium ? '$'+(options.estimatedPremium*0.5).toFixed(2) : '—'}`,
      watch:    `${alert?.ticker} noted. Check back when price pulls back to the entry zone.`,
      declined: 'No position taken. The AI will find a better setup next scan.'
    };

    const gate = document.getElementById('approvalGate');
    if (gate) {
      gate.innerHTML = `
        <div class="pipeline-complete-block">
          <div class="complete-icon" style="font-size:36px">${icons[decision]}</div>
          <div class="complete-title">${titles[decision]}</div>
          <div class="complete-msg">${msgs[decision]}</div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:8px">
            ${decision === 'approved' ? `<button class="btn btn--secondary" onclick="App.switchTab('journal')">→ View Journal</button>` : ''}
            <button class="btn btn--secondary" onclick="AgentUI.resetPipeline()">↻ Run New Scan</button>
          </div>
        </div>
      `;
    }
  },

  resetPipeline() {
    clearInterval(AgentUI._timer);
    const container = document.getElementById('pipelineContainer');
    if (container) {
      container.innerHTML = `
        <div class="pipeline-idle">
          <div class="pipeline-idle-icon">◈</div>
          <div class="pipeline-idle-text">Pipeline ready. Add tickers to your watchlist and run the AI analysis.</div>
        </div>
      `;
    }
  }
};
