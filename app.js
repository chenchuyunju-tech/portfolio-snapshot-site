const state = {
  meta: null,
  summary: null,
  currentView: null,
  zhangbo: null,
  returnView: "cum",
  cache: new Map(),
};

const els = {
  generatedAt: document.getElementById("generatedAt"),
  dateBounds: document.getElementById("dateBounds"),
  presetSelect: document.getElementById("presetSelect"),
  assetSelect: document.getElementById("assetSelect"),
  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
  maskToggle: document.getElementById("maskToggle"),
  kpiTotalAssets: document.getElementById("kpiTotalAssets"),
  kpiTwr: document.getElementById("kpiTwr"),
  kpiTotalReturn: document.getElementById("kpiTotalReturn"),
  kpiRange: document.getElementById("kpiRange"),
  kpiIrr: document.getElementById("kpiIrr"),
  kpiCumPnl: document.getElementById("kpiCumPnl"),
  kpiMaxDd: document.getElementById("kpiMaxDd"),
  kpiZhangbo: document.getElementById("kpiZhangbo"),
};

function formatPct(value) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function formatCny(value, mask) {
  if (value == null || Number.isNaN(value)) return "-";
  if (mask) return "****";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function layout({ percent = false, mask = false }) {
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 40, r: 24, t: 20, b: 36 },
    xaxis: { showgrid: false },
    yaxis: { showgrid: false, zeroline: false, tickformat: percent ? ".2%" : undefined, showticklabels: !mask },
  };
}

async function loadJson(path) {
  if (!state.cache.has(path)) {
    state.cache.set(path, fetch(path).then((r) => r.json()));
  }
  return state.cache.get(path);
}

function renderPresetOptions() {
  els.presetSelect.innerHTML = state.meta.presets.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join("");
  els.presetSelect.value = state.meta.default_preset;
}

function renderAssetOptions() {
  const preset = els.presetSelect.value;
  const options = state.meta.asset_options[preset] || [];
  const current = els.assetSelect.value;
  const html = ['<option value="">留空=当前资产范围下全部资产</option>']
    .concat(options.map((opt) => `<option value="${opt.value}">${opt.label}</option>`))
    .join("");
  els.assetSelect.innerHTML = html;
  const valid = options.some((opt) => opt.value === current);
  els.assetSelect.value = valid ? current : "";
}

function filterSeries(series) {
  return series.filter((row) => row.date >= els.startDate.value && row.date <= els.endDate.value);
}

function updateKpis(series, metrics, effectiveStart) {
  const mask = els.maskToggle.checked;
  const last = series.at(-1);
  els.kpiTotalAssets.textContent = formatCny(last?.market_value_cny ?? metrics.total_assets, mask);
  els.kpiTwr.textContent = formatPct(last?.cum_return ?? metrics.twr);
  els.kpiTotalReturn.textContent = formatPct(metrics.total_return);
  els.kpiRange.textContent = series.length ? `${effectiveStart || series[0].date} -> ${series.at(-1).date}` : "-";
  els.kpiIrr.textContent = formatPct(metrics.irr_implied_cum_return);
  els.kpiCumPnl.textContent = formatCny(last?.cum_pnl ?? metrics.cum_pnl, mask);
  els.kpiMaxDd.textContent = formatPct(metrics.max_dd);
}

function updateZhangboKpi(series) {
  const mask = els.maskToggle.checked;
  const last = series.at(-1);
  els.kpiZhangbo.textContent = formatCny(last?.zhangbo_value, mask);
}

function renderCharts(view, zhangboSeries) {
  const mask = els.maskToggle.checked;
  const filtered = filterSeries(view.series || []);
  updateKpis(filtered, view.metrics, view.effective_start);
  updateZhangboKpi(zhangboSeries);

  Plotly.newPlot("assetsChart", [{
    x: filtered.map((row) => row.date),
    y: filtered.map((row) => row.market_value_cny),
    type: "scatter",
    mode: "lines",
    line: { color: "#0f5c55", width: 3 },
    hovertemplate: mask ? "%{x}<extra></extra>" : "%{x}<br>%{y:,.2f}<extra></extra>",
  }], layout({ mask }), { responsive: true });

  Plotly.newPlot("navChart", [{
    x: filtered.map((row) => row.date),
    y: filtered.map((row) => row.nav),
    type: "scatter",
    mode: "lines",
    line: { color: "#224f8f", width: 3 },
  }], layout({}), { responsive: true });

  if (state.returnView === "cum") {
    Plotly.newPlot("returnsChart", [{
      x: filtered.map((row) => row.date),
      y: filtered.map((row) => row.cum_return),
      type: "scatter",
      mode: "lines",
      line: { color: "#1f4d7a", width: 3 },
    }], layout({ percent: true }), { responsive: true });
  } else {
    Plotly.newPlot("returnsChart", [{
      x: filtered.map((row) => row.date),
      y: filtered.map((row) => row.daily_return_calc),
      type: "bar",
      marker: { color: filtered.map((row) => row.daily_return_calc < 0 ? "#c24733" : "#2d8b57") },
    }], layout({ percent: true }), { responsive: true });
  }

  Plotly.newPlot("zhangboChart", [{
    x: zhangboSeries.map((row) => row.date),
    y: zhangboSeries.map((row) => row.zhangbo_value),
    type: "scatter",
    mode: "lines",
    line: { color: "#8d5f17", width: 3 },
    hovertemplate: mask ? "%{x}<extra></extra>" : "%{x}<br>%{y:,.2f}<extra></extra>",
  }, {
    x: zhangboSeries.map((row) => row.date),
    y: zhangboSeries.map((row) => 20000 * (1 + row.guarantee_return)),
    type: "scatter",
    mode: "lines",
    line: { color: "#b6915e", width: 2, dash: "dash" },
  }], layout({ mask }), { responsive: true });

  const top = [...(view.contrib || [])].sort((a, b) => a.daily_pnl_cny - b.daily_pnl_cny).slice(-20);
  Plotly.newPlot("contribChart", [{
    x: top.map((row) => row.daily_pnl_cny),
    y: top.map((row) => `${row.asset_id} | ${row.name}`),
    type: "bar",
    orientation: "h",
    marker: { color: top.map((row) => row.daily_pnl_cny < 0 ? "#c24733" : "#2d8b57") },
    hovertemplate: mask ? "%{y}<extra></extra>" : "%{y}<br>%{x:,.2f}<extra></extra>",
  }], layout({ mask }), { responsive: true });
}

async function loadCurrentView() {
  const preset = els.presetSelect.value;
  const assetId = els.assetSelect.value;
  const path = assetId ? `./data/assets/${preset}__${assetId}.json` : `./data/views/${preset}.json`;
  state.currentView = await loadJson(path);
  return state.currentView;
}

async function render() {
  const view = await loadCurrentView();
  const zhangbo = state.zhangbo || await loadJson("./data/tables/zhangbo.json");
  state.zhangbo = zhangbo;
  renderCharts(view, zhangbo.series || []);
}

function bindEvents() {
  els.presetSelect.addEventListener("change", async () => {
    renderAssetOptions();
    await render();
  });
  els.assetSelect.addEventListener("change", render);
  els.startDate.addEventListener("change", render);
  els.endDate.addEventListener("change", render);
  els.maskToggle.addEventListener("change", render);
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      document.querySelectorAll(".tab").forEach((node) => node.classList.remove("active"));
      tab.classList.add("active");
      state.returnView = tab.dataset.view;
      await render();
    });
  });
}

async function init() {
  state.meta = await loadJson("./data/meta.json");
  state.summary = await loadJson("./data/summary.json");
  renderPresetOptions();
  renderAssetOptions();
  els.generatedAt.textContent = state.meta.generated_at.replace("T", " ");
  els.dateBounds.textContent = `${state.meta.date_bounds.min} -> ${state.meta.date_bounds.max}`;
  els.startDate.min = state.meta.date_bounds.min;
  els.startDate.max = state.meta.date_bounds.max;
  els.endDate.min = state.meta.date_bounds.min;
  els.endDate.max = state.meta.date_bounds.max;
  els.startDate.value = state.meta.date_bounds.min;
  els.endDate.value = state.meta.date_bounds.max;
  bindEvents();
  await render();
}

init();
