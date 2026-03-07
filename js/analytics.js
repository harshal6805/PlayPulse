/* ============================================
   Analytics Module (Chart.js)
   ============================================ */

const Analytics = (() => {
  let charts = {};

  const chartColors = {
    accent: '#ff4444',
    accentSoft: 'rgba(255,68,68,.2)',
    success: '#00c853',
    successSoft: 'rgba(0,200,83,.2)',
    xp: '#ffd740',
    xpSoft: 'rgba(255,215,64,.2)',
    info: '#448aff',
    infoSoft: 'rgba(68,138,255,.2)'
  };

  function getChartDefaults() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      gridColor: isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)',
      textColor: isDark ? '#aaa' : '#555'
    };
  }

  function destroyAll() {
    Object.values(charts).forEach(c => { if (c) c.destroy(); });
    charts = {};
  }

  function createLineChart(canvasId, labels, data, label, color, bgColor) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    const defaults = getChartDefaults();
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label,
          data,
          borderColor: color,
          backgroundColor: bgColor,
          fill: true,
          tension: .4,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { color: defaults.gridColor },
            ticks: { color: defaults.textColor, font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: defaults.gridColor },
            ticks: { color: defaults.textColor, font: { size: 11 } }
          }
        }
      }
    });
  }

  function createBarChart(canvasId, labels, data, label, color, bgColor) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    const defaults = getChartDefaults();
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label,
          data,
          backgroundColor: bgColor,
          borderColor: color,
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: defaults.textColor, font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: defaults.gridColor },
            ticks: { color: defaults.textColor, font: { size: 11 } }
          }
        }
      }
    });
  }

  // Get last 7 day labels
  function getLast7Days() {
    const labels = [];
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
      dates.push(d.toISOString().slice(0, 10));
    }
    return { labels, dates };
  }

  // Get last 30 day date range
  function getLast30Days() {
    const labels = [];
    const dates = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      dates.push(d.toISOString().slice(0, 10));
    }
    return { labels, dates };
  }

  async function renderWeeklyDashboard() {
    const { labels, dates } = getLast7Days();
    const logs = await FirestoreOps.getLogsRange(dates[0], dates[dates.length - 1]);
    const logMap = {};
    logs.forEach(l => { logMap[l.date] = l; });
    const data = dates.map(d => logMap[d]?.minutesStudied || 0);

    if (charts.weeklyDashboard) charts.weeklyDashboard.destroy();
    charts.weeklyDashboard = createBarChart(
      'chart-weekly-dashboard', labels, data,
      'Minutes', chartColors.accent, chartColors.accentSoft
    );
  }

  async function renderAnalyticsPage() {
    // Render heatmap
    await renderHeatmap();

    const { labels: weekLabels, dates: weekDates } = getLast7Days();
    const { labels: monthLabels, dates: monthDates } = getLast30Days();

    const weekLogs = await FirestoreOps.getLogsRange(weekDates[0], weekDates[weekDates.length - 1]);
    const monthLogs = await FirestoreOps.getLogsRange(monthDates[0], monthDates[monthDates.length - 1]);

    const weekMap = {};
    weekLogs.forEach(l => { weekMap[l.date] = l; });
    const monthMap = {};
    monthLogs.forEach(l => { monthMap[l.date] = l; });

    // Weekly Study Minutes
    const weekMinutes = weekDates.map(d => weekMap[d]?.minutesStudied || 0);
    if (charts.weekly) charts.weekly.destroy();
    charts.weekly = createBarChart(
      'chart-weekly', weekLabels, weekMinutes,
      'Minutes', chartColors.info, chartColors.infoSoft
    );

    // Monthly Completions
    const monthCompletions = monthDates.map(d => monthMap[d]?.videosCompleted || 0);
    if (charts.monthly) charts.monthly.destroy();
    charts.monthly = createLineChart(
      'chart-monthly', monthLabels, monthCompletions,
      'Videos', chartColors.success, chartColors.successSoft
    );

    // Total Hours (cumulative)
    let cumHours = 0;
    const hoursData = monthDates.map(d => {
      cumHours += (monthMap[d]?.minutesStudied || 0) / 60;
      return parseFloat(cumHours.toFixed(1));
    });
    if (charts.hours) charts.hours.destroy();
    charts.hours = createLineChart(
      'chart-hours', monthLabels, hoursData,
      'Hours', chartColors.accent, chartColors.accentSoft
    );

    // XP Growth — approximate from daily completions
    let cumXP = 0;
    const xpData = monthDates.map(d => {
      const vc = monthMap[d]?.videosCompleted || 0;
      cumXP += vc * XP_PER_VIDEO;
      return cumXP;
    });
    if (charts.xp) charts.xp.destroy();
    charts.xp = createLineChart(
      'chart-xp', monthLabels, xpData,
      'XP', chartColors.xp, chartColors.xpSoft
    );
  }

  async function renderHeatmap() {
    const container = document.getElementById('heatmap-container');
    if (!container) return;

    // Get 365 days of dates
    const days = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      days.push(d.toISOString().slice(0, 10));
    }

    // Fetch logs for the range
    const logs = await FirestoreOps.getLogsRange(days[0], days[days.length - 1]);
    const logMap = {};
    logs.forEach(l => { logMap[l.date] = l.minutesStudied || 0; });

    // Determine level for each day
    function getLevel(mins) {
      if (!mins || mins <= 0) return 0;
      if (mins <= 20) return 1;
      if (mins <= 45) return 2;
      if (mins <= 90) return 3;
      return 4;
    }

    // Calculate grid: 53 columns (weeks), 7 rows (Sun=0 .. Sat=6)
    // The rightmost column is the current (partial) week
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDay = today.getDay(); // 0=Sun

    // Start date: go back 52 weeks from the most recent Sunday
    // Find the Sunday of the current week
    const currentSunday = new Date(today);
    currentSunday.setDate(today.getDate() - todayDay);

    // Go back 52 more weeks
    const startDate = new Date(currentSunday);
    startDate.setDate(startDate.getDate() - 52 * 7);

    const totalCols = 53; // 53 weeks
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

    container.innerHTML = '';

    // Build table
    const table = document.createElement('table');
    table.className = 'heatmap-table';

    // --- THEAD: Month labels ---
    const thead = document.createElement('thead');
    const monthRow = document.createElement('tr');
    // First cell for day-label column
    const thEmpty = document.createElement('th');
    monthRow.appendChild(thEmpty);

    // Calculate which month each column belongs to
    const colMonths = [];
    for (let col = 0; col < totalCols; col++) {
      // Reversed: col 0 is the current week, col 52 is 52 weeks ago
      const colDate = new Date(currentSunday);
      colDate.setDate(currentSunday.getDate() - col * 7);
      colMonths.push(colDate.getMonth());
    }

    let c = 0;
    while (c < totalCols) {
      const month = colMonths[c];
      let span = 1;
      while (c + span < totalCols && colMonths[c + span] === month) span++;
      const th = document.createElement('th');
      th.colSpan = span;
      th.textContent = monthNames[month];
      monthRow.appendChild(th);
      c += span;
    }
    thead.appendChild(monthRow);
    table.appendChild(thead);

    // --- TBODY: 7 rows (Sun-Sat) ---
    const tbody = document.createElement('tbody');
    for (let row = 0; row < 7; row++) {
      const tr = document.createElement('tr');

      // Day label cell
      const tdLabel = document.createElement('td');
      tdLabel.className = 'heatmap-day-label';
      tdLabel.textContent = dayLabels[row];
      tr.appendChild(tdLabel);

      // Data cells
      for (let col = 0; col < totalCols; col++) {
        // Reversed date calculation
        const cellDate = new Date(currentSunday);
        cellDate.setDate(currentSunday.getDate() - col * 7 + row);

        const td = document.createElement('td');

        if (cellDate > today) {
          // Future date — empty invisible cell
          td.innerHTML = '<div class="heat-cell heat-l0" style="visibility:hidden"></div>';
        } else {
          const dateStr = cellDate.toISOString().slice(0, 10);
          const mins = logMap[dateStr] || 0;
          const level = getLevel(mins);
          const cellDiv = document.createElement('div');
          cellDiv.className = `heat-cell heat-l${level}`;
          if (dateStr === today.toISOString().slice(0, 10)) cellDiv.classList.add('heat-today');

          // Popover tooltip
          const popover = document.createElement('div');
          popover.className = 'heat-popover';
          const dateLabel = cellDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          popover.textContent = mins > 0 ? `${dateLabel} — ${Math.round(mins)} min` : `${dateLabel} — No activity`;
          cellDiv.appendChild(popover);

          td.appendChild(cellDiv);
        }

        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);
  }

  // UI-10: Recolor charts when theme toggles
  function recolorCharts() {
    const defaults = getChartDefaults();
    Object.values(charts).forEach(chart => {
      if (!chart || !chart.options) return;
      if (chart.options.scales?.x) {
        chart.options.scales.x.grid.color = defaults.gridColor;
        chart.options.scales.x.ticks.color = defaults.textColor;
      }
      if (chart.options.scales?.y) {
        chart.options.scales.y.grid.color = defaults.gridColor;
        chart.options.scales.y.ticks.color = defaults.textColor;
      }
      chart.update('none');
    });
  }

  return { renderWeeklyDashboard, renderAnalyticsPage, destroyAll, recolorCharts };
})();
