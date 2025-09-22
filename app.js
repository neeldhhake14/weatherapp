// Stratus — Weather Intelligence
// Note: Add assets/icons set (see mapping below). Replace API key.

const OPENWEATHER_API_KEY = "1c0bfc44a7bddcef25e97632e1d57cee"; // TODO

// --------------- Utilities ----------------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const fmt = {
  tempC: v => Math.round(v) + "°",
  tempF: v => Math.round(v) + "°",
  wind: (mps, unit) => unit === "metric" ? `${Math.round(mps*3.6)} km/h` : `${Math.round(mps*2.237)} mph`,
  time: (ts, tz) => new Date((ts + tz) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  hour: (ts, tz) => new Date((ts + tz) * 1000).toLocaleTimeString([], { hour: "2-digit" }),
  day: (ts, tz) => new Date((ts + tz) * 1000).toLocaleDateString([], { weekday: "short" }),
  dateTime: (ts, tz) => new Date((ts + tz) * 1000).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }),
  percent: n => `${Math.round(n*100)}%`,
};

const storage = {
  get unit() { return localStorage.getItem("unit") || "metric"; },
  set unit(v) { localStorage.setItem("unit", v); },
  get lastPlace() {
    const raw = localStorage.getItem("place");
    return raw ? JSON.parse(raw) : null;
  },
  set lastPlace(p) { localStorage.setItem("place", JSON.stringify(p)); }
};

function debounce(fn, wait = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function setHidden(el, hidden) {
  if (!el) return;
  el.hidden = !!hidden;
}

function setActive(btn, active) {
  if (!btn) return;
  btn.classList.toggle("active", active);
  btn.setAttribute("aria-pressed", String(active));
}

// --------------- API Layer ----------------
const API = (() => {
  const BASE = "https://api.openweathermap.org";
  const geo = {
    async direct(q, limit = 5) {
      const url = `${BASE}/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=${limit}&appid=${OPENWEATHER_API_KEY}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Geo ${r.status}`);
      return r.json();
    }
  };

  async function onecall(lat, lon, unit = "metric") {
    // Try One Call 3.0 then fallback to 2.5
    const u3 = `${BASE}/data/3.0/onecall?lat=${lat}&lon=${lon}&units=${unit}&exclude=minutely,alerts&appid=${OPENWEATHER_API_KEY}`;
    const r3 = await fetch(u3);
    if (r3.ok) return r3.json();

    const u25 = `${BASE}/data/2.5/onecall?lat=${lat}&lon=${lon}&units=${unit}&exclude=minutely,alerts&appid=${OPENWEATHER_API_KEY}`;
    const r25 = await fetch(u25);
    if (!r25.ok) throw new Error(`OneCall ${r3.status}/${r25.status}`);
    return r25.json();
  }

  return { geo, onecall };
})();

// --------------- Icon Mapping ----------------
const ICONS = {
  "01d": "clear-day", "01n": "clear-night",
  "02d": "partly-cloudy-day", "02n": "partly-cloudy-night",
  "03d": "cloudy", "03n": "cloudy",
  "04d": "overcast", "04n": "overcast",
  "09d": "shower-rain", "09n": "shower-rain",
  "10d": "rain", "10n": "rain",
  "11d": "thunder", "11n": "thunder",
  "13d": "snow", "13n": "snow",
  "50d": "mist", "50n": "mist"
};

// --------------- State ----------------
const State = {
  unit: storage.unit, // "metric"|"imperial"
  place: storage.lastPlace || null, // { name, lat, lon, country, state }
  data: null, // OneCall response
  setUnit(u) {
    this.unit = u;
    storage.unit = u;
  },
  setPlace(p) {
    this.place = p;
    storage.lastPlace = p;
  },
  setData(d) { this.data = d; }
};

// --------------- Renderers ----------------
function renderCurrent() {
  const d = State.data;
  if (!d) return;

  const unit = State.unit;
  const tz = d.timezone_offset || 0;

  $("#temp").textContent = unit === "metric" ? fmt.tempC(d.current.temp) : fmt.tempF(d.current.temp);
  $("#cond").textContent = d.current.weather?.[0]?.description?.replace(/\b\w/g, m => m.toUpperCase()) || "—";
  $("#feels").textContent = `Feels like ${unit === "metric" ? fmt.tempC(d.current.feels_like) : fmt.tempF(d.current.feels_like)}`;
  $("#loc").textContent = State.place?.name ? `${State.place.name}${State.place.state ? ", " + State.place.state : ""}${State.place.country ? ", " + State.place.country : ""}` : "—";
  $("#high").textContent = unit === "metric" ? fmt.tempC(d.daily?.[0]?.temp?.max) : fmt.tempF(d.daily?.[0]?.temp?.max);
  $("#low").textContent = unit === "metric" ? fmt.tempC(d.daily?.[0]?.temp?.min) : fmt.tempF(d.daily?.[0]?.temp?.min);
  $("#humidity").textContent = `${d.current.humidity}%`;
  $("#wind").textContent = fmt.wind(d.current.wind_speed, unit);
  $("#uv").textContent = Math.round(d.current.uvi ?? 0);

  const iconCode = d.current.weather?.[0]?.icon || "01d";
  const name = ICONS[iconCode] || "clear-day";
  const path = `assets/icons/${name}.svg`;
  const img = $("#icon");
  img.src = path;
  img.alt = d.current.weather?.[0]?.main || "Weather";

  $("#localtime").textContent = fmt.dateTime(d.current.dt, d.timezone_offset);

  // Remove skeletons
  ["#current", "#hourly", "#daily"].forEach(sel => $(sel)?.classList.remove("skeleton"));
  $("#app").setAttribute("aria-busy", "false");
}

function renderHourly() {
  const d = State.data;
  if (!d) return;
  const unit = State.unit;
  const tz = d.timezone_offset || 0;
  const wrap = $("#hourly");
  wrap.innerHTML = d.hourly.slice(0, 24).map(h => {
    const code = h.weather?.[0]?.icon || "01d";
    const name = ICONS[code] || "clear-day";
    const icon = `assets/icons/${name}.svg`;
    const pop = (h.pop ?? 0);
    const p = pop > 0 ? `<div class="p">${fmt.percent(pop)}</div>` : `<div class="p">—</div>`;
    const t = unit === "metric" ? fmt.tempC(h.temp) : fmt.tempF(h.temp);
    return `
      <div class="hour">
        <div class="h">${fmt.hour(h.dt, tz)}</div>
        <img src="${icon}" alt="" width="36" height="36" />
        <div class="t">${t}</div>
        ${p}
      </div>
    `;
  }).join("");

  // Precip summary
  const next12 = d.hourly.slice(0, 12);
  const anyRain = next12.some(h => (h.rain?.["1h"] ?? 0) > 0 || (h.pop ?? 0) > 0.4);
  $("#precipSummary").textContent = anyRain ? "Possible precipitation in the next hours" : "No precipitation expected soon";
}

function renderDaily() {
  const d = State.data;
  if (!d) return;
  const unit = State.unit;
  const tz = d.timezone_offset || 0;
  const wrap = $("#daily");
  wrap.innerHTML = d.daily.slice(0, 7).map(day => {
    const code = day.weather?.[0]?.icon || "01d";
    const name = ICONS[code] || "clear-day";
    const icon = `assets/icons/${name}.svg`;
    const hi = unit === "metric" ? fmt.tempC(day.temp.max) : fmt.tempF(day.temp.max);
    const lo = unit === "metric" ? fmt.tempC(day.temp.min) : fmt.tempF(day.temp.min);
    const pop = day.pop ?? 0;
    return `
      <div class="day">
        <div class="name">${fmt.day(day.dt, tz)}</div>
        <img src="${icon}" alt="" width="40" height="40" style="margin: 0 auto;" />
        <div class="range">${hi} / ${lo}</div>
        <div class="pop">${pop ? fmt.percent(pop) : "—"}</div>
      </div>
    `;
  }).join("");
}

// --------------- Search & Interaction ----------------
const UI = (() => {
  const q = $("#q");
  const sList = $("#suggestions");
  const clearBtn = $("#clearBtn");
  const unitC = $("#unitC");
  const unitF = $("#unitF");
  const geoBtn = $("#geoBtn");
  const offlineBadge = $("#offlineBadge");

  function showSuggestions(items) {
    if (!items?.length) { sList.classList.remove("show"); sList.innerHTML = ""; return; }
    sList.innerHTML = items.map((p, i) => `
      <li role="option" data-i="${i}">
        <span>${p.name}${p.state ? ", " + p.state : ""}${p.country ? ", " + p.country : ""}</span>
        <span class="muted">${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}</span>
      </li>
    `).join("");
    sList.classList.add("show");
  }

  const onSearch = debounce(async () => {
    const query = q.value.trim();
    setHidden(clearBtn, !query);
    if (query.length < 2) { showSuggestions([]); return; }
    try {
      const results = await API.geo.direct(query, 6);
      showSuggestions(results);
      sList.dataset.items = JSON.stringify(results);
    } catch (e) {
      showSuggestions([]);
      console.error(e);
    }
  }, 250);

  function hideSuggestions() { sList.classList.remove("show"); }

  function applyUnit(u) {
    if (State.unit === u) return;
    State.setUnit(u);
    setActive(unitC, u === "metric");
    setActive(unitF, u === "imperial");
    // re-fetch with new units for accuracy
    if (State.place) fetchAndRender(State.place);
  }

  async function useGeo() {
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 9000 }));
      const { latitude: lat, longitude: lon } = pos.coords;
      const place = { name: "My location", lat, lon, country: "" };
      State.setPlace(place);
      await fetchAndRender(place*_
$$
