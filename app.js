/* ============================================================
   BetterCalendar — app.js
   Google Calendar API (GIS + GAPI) · 12-month year view
   ============================================================ */

'use strict';

// ── State ─────────────────────────────────────────────────────
let tokenClient  = null;
let gapiInited   = false;
let gisInited    = false;
let allCalendars = [];          // [{id, summary, backgroundColor, …}]
let allEvents    = [];          // flat array of GCal event objects (decorated)
let selectedIds  = new Set();   // currently visible calendar IDs

// Layout constants for event rows
const LANE_H   = 16;  // height of each event bar / dot row (px)
const LANE_GAP = 3;   // vertical gap between lanes (px)

// ── Google API bootstrap ──────────────────────────────────────

/** Called by the GAPI <script> onload */
function gapiLoaded() {
  gapi.load('client', async () => {
    await gapi.client.init({
      apiKey: CONFIG.API_KEY,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
    });
    gapiInited = true;
    checkReady();
  });
}

/** Called by the GIS <script> onload */
function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    callback: onTokenReceived,
  });
  gisInited = true;
  checkReady();
}

function checkReady() {
  if (gapiInited && gisInited) {
    document.getElementById('signin-btn').disabled = false;
  }
}

// ── Authentication ────────────────────────────────────────────

function signIn() {
  if (!tokenClient) return;
  // prompt:'' = no consent screen if already authorised; Google shows
  // account-picker if needed. First-time users will see consent automatically.
  tokenClient.requestAccessToken({ prompt: '' });
}

function signOut() {
  const token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token, () => {});
    gapi.client.setToken('');
  }
  resetUI();
}

async function onTokenReceived(resp) {
  if (resp.error) {
    console.error('Auth error:', resp);
    showError('Sign-in failed: ' + (resp.error_description || resp.error));
    return;
  }
  el('signin-btn').style.display  = 'none';
  el('signout-btn').style.display = '';
  el('welcome').style.display     = 'none';
  await loadAndRender();
}

function resetUI() {
  el('signin-btn').style.display  = '';
  el('signout-btn').style.display = 'none';
  el('filter-section').style.display = 'none';
  el('year-view').innerHTML = '';
  el('welcome').style.display = '';
  clearError();
  allCalendars = [];
  allEvents    = [];
  selectedIds.clear();
}

// ── Data loading ──────────────────────────────────────────────

async function loadAndRender() {
  setLoading(true);
  clearError();
  try {
    await loadCalendars();
    await loadEvents();
    renderYearView();
  } catch (err) {
    console.error(err);
    showError('Could not load calendar data — ' + (err.message || err));
  } finally {
    setLoading(false);
  }
}

async function loadCalendars() {
  const resp = await gapi.client.calendar.calendarList.list({ maxResults: 250 });
  allCalendars = (resp.result.items || []).sort((a, b) =>
    (a.summaryOverride || a.summary).localeCompare(b.summaryOverride || b.summary)
  );

  // Restore saved selection; default = all calendars selected
  const saved = loadSavedSelection();
  if (saved && saved.length) {
    selectedIds = new Set(saved.filter(id => allCalendars.some(c => c.id === id)));
  } else {
    selectedIds = new Set(allCalendars.map(c => c.id));
  }

  renderCalendarFilters();
}

async function loadEvents() {
  const now      = new Date();
  const timeMin  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  // fetch 12 full months ahead
  const timeMax  = new Date(now.getFullYear(), now.getMonth() + 12, 31, 23, 59, 59).toISOString();

  allEvents = [];

  await Promise.all(allCalendars.map(async cal => {
    try {
      let pageToken;
      do {
        const r = await gapi.client.calendar.events.list({
          calendarId:   cal.id,
          timeMin,
          timeMax,
          maxResults:   2500,
          singleEvents: true,
          orderBy:      'startTime',
          pageToken,
        });
        const items = r.result.items || [];
        items.forEach(ev => {
          ev._calId    = cal.id;
          ev._calColor = cal.backgroundColor || '#4285F4';
          ev._calName  = cal.summaryOverride || cal.summary;
        });
        allEvents.push(...items);
        pageToken = r.result.nextPageToken;
      } while (pageToken);
    } catch (err) {
      console.warn(`Skipped calendar "${cal.summary}":`, err);
    }
  }));
}

// ── Calendar filter UI ────────────────────────────────────────

function renderCalendarFilters() {
  const list = el('calendar-list');
  list.innerHTML = '';

  allCalendars.forEach(cal => {
    const label = document.createElement('label');
    label.className = 'calendar-filter-item' + (selectedIds.has(cal.id) ? ' active' : '');
    label.style.setProperty('--cal-color', cal.backgroundColor || '#4285F4');
    label.title = cal.summaryOverride || cal.summary;

    const cb = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = selectedIds.has(cal.id);
    cb.addEventListener('change', () => {
      if (cb.checked) { selectedIds.add(cal.id);    label.classList.add('active');    }
      else            { selectedIds.delete(cal.id); label.classList.remove('active'); }
      saveSelection();
      renderYearView();
    });

    const dot = document.createElement('span');
    dot.className         = 'color-dot';
    dot.style.background  = cal.backgroundColor || '#4285F4';

    const name = document.createElement('span');
    name.textContent = cal.summaryOverride || cal.summary;

    label.appendChild(cb);
    label.appendChild(dot);
    label.appendChild(name);
    list.appendChild(label);
  });

  el('filter-section').style.display = '';
}

// ── Year view rendering ───────────────────────────────────────

function renderYearView() {
  const container = el('year-view');
  container.innerHTML = '';

  const visible = allEvents.filter(ev => selectedIds.has(ev._calId));
  const now = new Date();

  for (let i = 0; i < 12; i++) {
    container.appendChild(renderMonth(now.getFullYear(), now.getMonth() + i, visible));
  }
}

// ── Month card ────────────────────────────────────────────────

function renderMonth(baseYear, baseMonth, events) {
  // JavaScript Date handles month overflow (e.g. month 13 → next year)
  const anchor    = new Date(baseYear, baseMonth, 1);
  const year      = anchor.getFullYear();
  const month     = anchor.getMonth();   // 0–11

  const firstDOW  = anchor.getDay();     // 0=Sun … 6=Sat
  const daysInMo  = new Date(year, month + 1, 0).getDate();
  const numWeeks  = Math.ceil((firstDOW + daysInMo) / 7);

  const moStart   = new Date(year, month, 1);
  const moEnd     = new Date(year, month, daysInMo, 23, 59, 59);

  // Events overlapping this month, sorted by start
  const moEvents  = events
    .filter(ev => {
      const s = evStart(ev), e = evEnd(ev);
      return s && e && s <= moEnd && e >= moStart;
    })
    .sort((a, b) => evStart(a) - evStart(b));

  // ── Build DOM ──
  const card = document.createElement('div');
  card.className = 'month-container';

  // Title
  const title = document.createElement('div');
  title.className   = 'month-title';
  title.textContent = anchor.toLocaleString('default', { month: 'long', year: 'numeric' });
  card.appendChild(title);

  // Day-of-week headers
  const hdrs = document.createElement('div');
  hdrs.className = 'day-headers';
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
    const h = document.createElement('div');
    h.className   = 'day-header';
    h.textContent = d;
    hdrs.appendChild(h);
  });
  card.appendChild(hdrs);

  const weeksEl = document.createElement('div');
  weeksEl.className = 'weeks-container';

  const today = new Date();

  for (let w = 0; w < numWeeks; w++) {
    // Actual dates for each column (0=Sun … 6=Sat) in this week row
    // Date constructor handles under/overflow automatically
    const weekDates = Array.from({ length: 7 }, (_, col) =>
      new Date(year, month, 1 - firstDOW + w * 7 + col)
    );
    const wStart = weekDates[0];
    const wEnd   = weekDates[6];

    const wrapper  = document.createElement('div');
    wrapper.className = 'week-wrapper';

    // Day-number row
    const cells = document.createElement('div');
    cells.className = 'day-cells';
    weekDates.forEach(wd => {
      const cell = document.createElement('div');
      cell.className = 'day-cell';
      if (wd.getMonth() === month) {
        const num = document.createElement('span');
        num.className   = 'day-number' + (sameDay(wd, today) ? ' today' : '');
        num.textContent = wd.getDate();
        cell.appendChild(num);
      }
      cells.appendChild(cell);
    });
    wrapper.appendChild(cells);

    // Events that touch this week
    const wEvents = moEvents.filter(ev => {
      const s = evStart(ev), e = evEnd(ev);
      return s <= wEnd && e >= wStart;
    });

    if (wEvents.length) {
      wrapper.appendChild(buildEventsLayer(wEvents, weekDates));
    }

    weeksEl.appendChild(wrapper);
  }

  card.appendChild(weeksEl);
  return card;
}

// ── Events layer for one week row ────────────────────────────

function buildEventsLayer(events, weekDates) {
  const wStart = weekDates[0];
  const wEnd   = weekDates[6];

  // Enrich each event with column positions for this week
  const items = events.map(ev => {
    const s = evStart(ev);
    const e = evEnd(ev);

    const clampS = s < wStart ? wStart : s;
    const clampE = e > wEnd   ? wEnd   : e;

    const startCol   = clampS.getDay();  // 0–6
    const endCol     = clampE.getDay();  // 0–6
    const startsHere = s >= wStart;
    const endsHere   = e <= wEnd;
    const isMulti    = s.getTime() !== e.getTime(); // truly spans >1 day

    return { ev, startCol, endCol, startsHere, endsHere, isMulti };
  });

  // Sort: earlier start first; longer span first on ties (fills wider lanes)
  items.sort((a, b) =>
    a.startCol - b.startCol ||
    (b.endCol - b.startCol) - (a.endCol - a.startCol)
  );

  // Lane assignment: greedy, lowest available lane
  const laneEnds = []; // laneEnds[i] = endCol of last event assigned to lane i
  items.forEach(item => {
    let lane = laneEnds.findIndex(end => end < item.startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.endCol;
    item.lane = lane;
  });

  const numLanes   = laneEnds.length;
  const layerH     = numLanes * (LANE_H + LANE_GAP) + LANE_GAP;

  const layer = document.createElement('div');
  layer.className   = 'events-layer';
  layer.style.height = layerH + 'px';

  items.forEach(({ ev, startCol, endCol, startsHere, endsHere, isMulti, lane }) => {
    const top    = lane * (LANE_H + LANE_GAP) + LANE_GAP;
    const title  = ev.summary || '(No title)';
    const s      = evStart(ev);
    const e      = evEnd(ev);
    const tip    = `${title}\n${fmtRange(s, e)}\n📅 ${ev._calName}`;

    if (isMulti) {
      // ── Multi-day event → coloured bar ──
      const bar = document.createElement('div');
      bar.className = 'event-bar';

      // Left edge
      if (startsHere) {
        bar.style.left = pct(startCol / 7);
      } else {
        bar.style.left = '0';
      }

      // Right edge
      if (endsHere) {
        bar.style.right = pct((6 - endCol) / 7);
      } else {
        bar.style.right = '0';
      }

      bar.style.top        = top + 'px';
      bar.style.background = ev._calColor;

      // Border radius: round the ends that terminate here
      const tl = startsHere ? '4px' : '0';
      const tr = endsHere   ? '4px' : '0';
      bar.style.borderRadius = `${tl} ${tr} ${tr} ${tl}`;

      // Label: show event name only where it "starts" in the visible portion
      bar.textContent = title;

      bar.addEventListener('mouseenter', e => showTip(e, tip));
      bar.addEventListener('mouseleave', hideTip);
      bar.addEventListener('click',      ()  => openEvent(ev));

      layer.appendChild(bar);

    } else {
      // ── Single-day event → small dot with hover tooltip ──
      const dot = document.createElement('div');
      dot.className = 'event-dot';

      // Centre horizontally in the column
      dot.style.left       = pct((startCol + 0.5) / 7);
      dot.style.top        = (top + Math.floor((LANE_H - 7) / 2)) + 'px';
      dot.style.background = ev._calColor;

      dot.addEventListener('mouseenter', e => showTip(e, tip));
      dot.addEventListener('mouseleave', hideTip);
      dot.addEventListener('click',      ()  => openEvent(ev));

      layer.appendChild(dot);
    }
  });

  return layer;
}

// ── Date utilities ────────────────────────────────────────────

/** Parse "YYYY-MM-DD" as local midnight (avoids UTC offset issues) */
function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Start date (local, day-level) for a GCal event */
function evStart(ev) {
  if (ev.start.date) return parseLocalDate(ev.start.date);
  const dt = new Date(ev.start.dateTime);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/**
 * End date (local, day-level, INCLUSIVE) for a GCal event.
 * GCal all-day end dates are exclusive → subtract 1 day.
 */
function evEnd(ev) {
  if (ev.end.date) {
    const d = parseLocalDate(ev.end.date);
    d.setDate(d.getDate() - 1);
    return d;
  }
  const dt = new Date(ev.end.dateTime);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function fmtRange(start, end) {
  const o = { month: 'short', day: 'numeric' };
  if (sameDay(start, end)) {
    return start.toLocaleDateString('en-US', { ...o, year: 'numeric' });
  }
  return start.toLocaleDateString('en-US', o) +
         ' – ' +
         end.toLocaleDateString('en-US', { ...o, year: 'numeric' });
}

/** Open event in Google Calendar (new tab) */
function openEvent(ev) {
  if (ev.htmlLink) window.open(ev.htmlLink, '_blank', 'noopener');
}

// ── Tooltip ───────────────────────────────────────────────────

const tipEl = document.getElementById('tooltip');

document.addEventListener('mousemove', e => {
  if (tipEl.style.display !== 'none') {
    tipEl.style.left = (e.clientX + 14) + 'px';
    tipEl.style.top  = (e.clientY - 12) + 'px';
  }
});

function showTip(e, text) {
  tipEl.textContent = text;
  tipEl.style.display = '';
  tipEl.style.left = (e.clientX + 14) + 'px';
  tipEl.style.top  = (e.clientY - 12) + 'px';
}
function hideTip() { tipEl.style.display = 'none'; }

// ── localStorage helpers ──────────────────────────────────────

function saveSelection() {
  try { localStorage.setItem('bc_selected', JSON.stringify([...selectedIds])); } catch (_) {}
}
function loadSavedSelection() {
  try { return JSON.parse(localStorage.getItem('bc_selected') || 'null'); } catch (_) { return null; }
}

// ── UI helpers ────────────────────────────────────────────────

function el(id)           { return document.getElementById(id); }
function pct(ratio)       { return (ratio * 100).toFixed(3) + '%'; }
function setLoading(show) { el('loading').style.display = show ? '' : 'none'; }
function showError(msg)   { const e = el('error-msg'); e.textContent = msg; e.style.display = ''; }
function clearError()     { el('error-msg').style.display = 'none'; }

// ── Wire up buttons ───────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  el('signin-btn').addEventListener('click',  signIn);
  el('signout-btn').addEventListener('click', signOut);
  el('refresh-btn').addEventListener('click', async () => {
    setLoading(true);
    clearError();
    try   { await loadEvents(); renderYearView(); }
    catch (err) { showError('Refresh failed: ' + err.message); }
    finally     { setLoading(false); }
  });
});
