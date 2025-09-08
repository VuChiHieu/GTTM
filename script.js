/* ====== CONFIG ====== */
const OPENWEATHER_KEY = "fc77d3dc7e2bd53cd1b7fc88dd579d85";
const OSRM_SERVER = "https://router.project-osrm.org"; // server Việt Nam

import { WeatherModule } from './weather.js';
import { TrafficModule } from './traffic.js';
import { toast } from './toast.js';

/* ====== SELECTORS ====== */
const elFrom = document.getElementById("inputFrom");
const elTo = document.getElementById("inputTo");
const btnUseMyLocation = document.getElementById("btnUseMyLocation");
const btnRoute = document.getElementById("btnRoute");
const btnClear = document.getElementById("btnClear");
const btnStartVoice = document.getElementById("btnStartVoice");
const btnStopVoice = document.getElementById("btnStopVoice");
const btnDark = document.getElementById("btnDark");
const btnDrivingMode = document.getElementById("btnDrivingMode");
const btnLocate = document.getElementById("btnLocate");
const btnRotate = document.getElementById("btnRotate");

const sumDistance = document.getElementById("sumDistance");
const sumDuration = document.getElementById("sumDuration");
const sumETA = document.getElementById("sumETA");
const stepsList = document.getElementById("stepsList");

const statusGPS = document.getElementById("statusGPS");
const statusSpeed = document.getElementById("statusSpeed");
const statusHeading = document.getElementById("statusHeading");
let cachedSteps = [];


/* ====== MAP ====== */
let map, tileLayer, routeLine, startMarker, endMarker, userMarker, headingLocked = false;
let currentHeading = 0;
let watchId = null;

initMap();
const voiceNav = {
  speak: speak
};
const weather = new WeatherModule(map, OPENWEATHER_KEY, toast, voiceNav);
const traffic = new TrafficModule(map);
function initMap(){
  map = L.map("map", {
    zoomControl: true,
    attributionControl: true,
    worldCopyJump: true
  }).setView([16.047, 108.206], 6); // VN trung tâm

  // Light/Dark tile sets
  const lightTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap'
  });
  const darkTiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap & Carto'
  });

  // start with dark by default
  tileLayer = darkTiles.addTo(map);
  map.on("click", (e)=> console.log("Map clicked:", e.latlng));
}
/* ====== autocomplete ====== */
// Autocomplete function
function setupAutocomplete(inputEl, listEl, onSelect) {
  inputEl.addEventListener("input", async () => {
    const query = inputEl.value.trim();
    if (query.length < 3) {
      listEl.style.display = "none";
      return;
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`;
    const res = await fetch(url, { headers: { "Accept-Language": "vi" } });
    const data = await res.json();

    // Clear old
    listEl.innerHTML = "";
    if (!data.length) {
      listEl.style.display = "none";
      return;
    }

    data.forEach(item => {
      const div = document.createElement("div");
      div.className = "autocomplete-item";
      div.textContent = item.display_name;
      div.addEventListener("click", () => {
        inputEl.value = item.display_name;
        listEl.style.display = "none";
        onSelect(item);
      });
      listEl.appendChild(div);
    });

    listEl.style.display = "block";
  });
}

const listFrom = document.getElementById("autocompleteFrom");
const listTo = document.getElementById("autocompleteTo");

// Setup autocomplete cho điểm bắt đầu
setupAutocomplete(elFrom, listFrom, (item) => {
  elFrom.dataset.lat = item.lat;
  elFrom.dataset.lng = item.lon;
});

// Setup autocomplete cho điểm đến
setupAutocomplete(elTo, listTo, (item) => {
  elTo.dataset.lat = item.lat;
  elTo.dataset.lng = item.lon;
});

/* ====== UTIL ====== */
function parseLatLng(input){
  // allow "lat,lng"
  if(!input) return null;
  const m = input.trim().match(/^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/);
  if(m) return [parseFloat(m[1]), parseFloat(m[3])];
  return null;
}

function toHHMM(durationSec){
  const hrs = Math.floor(durationSec/3600);
  const mins = Math.round((durationSec%3600)/60);
  if(hrs>0) return `${hrs}h ${mins}m`;
  return `${mins} phút`;
}

function formatDistance(m){
  if(m >= 1000) return (m/1000).toFixed(1) + " km";
  return Math.round(m) + " m";
}

function etaString(sec){
  const eta = new Date(Date.now() + sec*1000);
  const hh = eta.getHours().toString().padStart(2,'0');
  const mm = eta.getMinutes().toString().padStart(2,'0');
  return `${hh}:${mm}`;
}

/* ====== ROUTING via OSRM ====== */
async function getRoute(fromLatLng, toLatLng){
  const coords = `${fromLatLng[1]},${fromLatLng[0]};${toLatLng[1]},${toLatLng[0]}`;
  const url = `${OSRM_SERVER}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=false&annotations=distance`;

  const res = await fetch(url);
  if(!res.ok){
    throw new Error("OSRM lỗi hoặc endpoint không truy cập được");
  }
  const data = await res.json();
  if(!data.routes || !data.routes.length) throw new Error("Không tìm thấy lộ trình");
  return data.routes[0];
}

function clearRoute(){
  if(routeLine){ map.removeLayer(routeLine); routeLine = null; }
  if(startMarker){ map.removeLayer(startMarker); startMarker = null; }
  if(endMarker){ map.removeLayer(endMarker); endMarker = null; }
  stepsList.innerHTML = "";
  sumDistance.textContent = "—";
  sumDuration.textContent = "—";
  sumETA.textContent = "—";
}

/* ====== DRAW ROUTE ====== */
function drawRoute(route, fromLatLng, toLatLng){
  const coords = route.geometry.coordinates.map(c=>[c[1], c[0]]);
  if(routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(coords, {weight:6, opacity:0.9}).addTo(map);
  map.fitBounds(routeLine.getBounds(), {padding:[40,40]});

  // markers
  if(startMarker) map.removeLayer(startMarker);
  if(endMarker) map.removeLayer(endMarker);
  startMarker = L.marker(fromLatLng, {title:"Điểm bắt đầu"}).addTo(map);
  endMarker = L.marker(toLatLng, {title:"Điểm đến"}).addTo(map);

  // summary
  sumDistance.textContent = formatDistance(route.distance);
  sumDuration.textContent = toHHMM(route.duration);
  sumETA.textContent = etaString(route.duration);

  // steps
  const legs = route.legs || [];
  const steps = legs.flatMap(l=>l.steps || []);
  renderSteps(steps);
  cachedSteps = steps; // for voice
}

/* ====== STEP ICONS ====== */
function maneuverIcon(m){
  const type = m.type || "";
  const mod = m.modifier || "";
  // simple mapping
  if(type==="depart") return "🚩";
  if(type==="arrive") return "🏁";
  if(type==="roundabout") return "🛑";
  if(type==="merge") return "↗️";
  if(type==="fork") return "🔀";
  if(type==="end of road") return "⤵️";
  if(type==="turn"){
    if(mod==="left") return "⬅️";
    if(mod==="right") return "➡️";
    if(mod==="slight left") return "↖️";
    if(mod==="slight right") return "↗️";
    if(mod==="sharp left") return "⤿";
    if(mod==="sharp right") return "⤳";
    return "↩️";
  }
  if(type==="continue") return "⬆️";
  if(type==="uturn") return "🔁";
  return "➡️";
}

/* ====== RENDER STEPS ====== */
function renderSteps(steps){
  stepsList.innerHTML = "";
  steps.forEach((s, idx)=>{
    const li = document.createElement("li");
    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = maneuverIcon(s.maneuver || {});
    const text = document.createElement("div");
    text.className = "text";
    const primary = document.createElement("div");
    primary.textContent = s.maneuver.instruction || s.name || "Đi thẳng";
    const dist = document.createElement("div");
    dist.className = "dist";
    const d = s.distance || 0;
    dist.textContent = `~ ${formatDistance(d)}`;
    text.appendChild(primary);
    text.appendChild(dist);
    li.appendChild(icon);
    li.appendChild(text);
    stepsList.appendChild(li);
  });
}

/* ====== VOICE NAVIGATION ====== */
let speaking = false;
let stepIndex = 0;
let voiceTimer = null;

// Hàm đọc text
function speak(text) {
  if (!("speechSynthesis" in window)) {
    toast.show("Trình duyệt không hỗ trợ voice.");
    return;
  }
  const msg = new SpeechSynthesisUtterance(text);
  msg.lang = "vi-VN";
  window.speechSynthesis.speak(msg);
}

function startVoice() {
  if (!cachedSteps.length) {
    toast.show("Chưa có lộ trình để đọc hướng dẫn.");
    return;
  }

  speaking = true;
  stepIndex = 0;

  // Dừng timer cũ nếu có
  if (voiceTimer) clearInterval(voiceTimer);

  speak("Bắt đầu hành trình. Giữ an toàn khi lái xe.");

  voiceTimer = setInterval(() => {
    if (!speaking) {
      clearInterval(voiceTimer);
      return;
    }

    if (stepIndex < cachedSteps.length) {
      const step = cachedSteps[stepIndex];
      const instr = step.maneuver?.instruction || "Tiếp tục đi thẳng";
      speak(instr);
      stepIndex++;
    } else {
      speak("Bạn đã đến nơi. Kết thúc hành trình.");
      clearInterval(voiceTimer);
      speaking = false;
    }
  }, 8000); // demo: đọc mỗi 8s
}

function stopVoice() {
  speaking = false;
  if (voiceTimer) {
    clearInterval(voiceTimer);
    voiceTimer = null;
  }
  window.speechSynthesis.cancel();
}

function pauseVoice() {
  window.speechSynthesis.pause();
}

function resumeVoice() {
  window.speechSynthesis.resume();
}


/* ====== USER LOCATION & HEADING ====== */
function ensureUserMarker(){
  if(!userMarker){
    const carIcon = L.divIcon({
      className: "car-icon",
      html: `<div style="transform: rotate(${currentHeading}deg); transition:transform .2s">
               🚗
             </div>`,
      iconSize: [24,24],
      iconAnchor: [12,12]
    });
    userMarker = L.marker(map.getCenter(), {icon: carIcon, zIndexOffset: 999}).addTo(map);
  }
}

function updateUserMarker(lat, lng){
  ensureUserMarker();
  userMarker.setLatLng([lat, lng]);
  const el = userMarker.getElement()?.querySelector("div");
  if(el) el.style.transform = `rotate(${currentHeading}deg)`;
}

function watchLocation() {
  if (!navigator.geolocation) {
    statusGPS.textContent = "GPS: không hỗ trợ";
    return;
  }
  if (watchId) navigator.geolocation.clearWatch(watchId);

  watchId = navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude, heading, speed } = pos.coords;

    // Hiển thị trạng thái
    statusGPS.textContent = `GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    statusSpeed.textContent = 
      (typeof speed === "number" && !Number.isNaN(speed)) 
      ? `Tốc độ ~ ${(speed * 3.6).toFixed(0)} km/h`
      : "Tốc độ ~ — km/h";

    if (typeof heading === "number" && !Number.isNaN(heading)) {
      currentHeading = heading;
      statusHeading.textContent = `Hướng ${currentHeading.toFixed(0)}°`;
    }

    // Update marker
    updateUserMarker(latitude, longitude);

    // Nếu drivingMode đang bật thì map follow user
    if (drivingMode) {
      map.setView([latitude, longitude], map.getZoom(), { animate: true });
    }

    if(weather && currentLocation){
      weather.checkAlerts(latitude, longitude);
    }

  }, err => {
    statusGPS.textContent = "GPS: lỗi/không cấp quyền";
    console.warn(err);
  }, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000
  });
}

// Flag driving mode
let drivingMode = false;

function toggleDrivingMode() {
  drivingMode = !drivingMode;
  document.body.classList.toggle("driving", drivingMode);

  if (!drivingMode) {
    // Khi tắt driving mode thì dừng follow user, nhưng vẫn giữ watch GPS
    console.log("Driving mode off");
  } else {
    console.log("Driving mode on");
  }
}

function listenDeviceOrientation(){
  window.addEventListener("deviceorientation", (e)=>{
    if(typeof e.alpha === "number"){
      // alpha 0-360 (compass-like), dùng như heading khi không có GPS heading
      currentHeading = e.alpha;
      statusHeading.textContent = `Hướng ${currentHeading.toFixed(0)}°`;
      if(userMarker){
        const el = userMarker.getElement()?.querySelector("div");
        if(el) el.style.transform = `rotate(${currentHeading}deg)`;
      }
    }
  }, true);
}

/* ====== EVENTS ====== */
let currentLocation = null;

// --- btnUseMyLocation ---
btnUseMyLocation.addEventListener("click", () => {
  if (!navigator.geolocation) {
    toast.show("Trình duyệt không hỗ trợ GPS.");
    return;
  }

  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    const lat = latitude.toFixed(6);
    const lng = longitude.toFixed(6);

    currentLocation = [latitude, longitude];

    // Gán vào input nếu tồn tại
    if (document.getElementById("startPoint")) {
      document.getElementById("startPoint").value = `${lat},${lng}`;
    }
    if (elFrom) {
      elFrom.value = `${lat},${lng}`;
    }

    // Cập nhật marker
    updateUserMarker(latitude, longitude);

    map.setView([latitude, longitude], 15);

    // --- Cập nhật thời tiết hiện tại ---
    weather.updateCurrent(latitude, longitude);

  }, err => {
    toast.show("Không lấy được vị trí của bạn: " + err.message);
  }, { enableHighAccuracy: true });
});

// --- btnRoute ---
btnRoute.addEventListener("click", async () => {
  try {
    const from = getLatLngFromInput(elFrom);
    const to = getLatLngFromInput(elTo);

    if (!from || !to) {
      toast.show("Vui lòng nhập hoặc chọn địa chỉ hợp lệ.");
      return;
    }

    clearRoute();
    const route = await getRoute(from, to);
    drawRoute(route, from, to);

    await weather.showRouteAlert(route.geometry.coordinates, { maxPoints: 20 });

    // --- Traffic ---
    traffic.showTraffic();

  } catch (err) {
    console.error(err);
    toast.show("Không tính được lộ trình. Kiểm tra OSRM server hoặc dữ liệu đầu vào.");
  }
});

function getLatLngFromInput(inputEl) {
  if (inputEl.dataset.lat && inputEl.dataset.lng) {
    return [parseFloat(inputEl.dataset.lat), parseFloat(inputEl.dataset.lng)];
  }
  // fallback: nếu user vẫn nhập tay dạng "lat,lng"
  if (inputEl.value.includes(",")) {
    return inputEl.value.split(",").map(v => parseFloat(v.trim()));
  }
  return null;
}

if(currentLocation && weather){
  weather.updateCurrent(currentLocation[0], currentLocation[1]);
}

btnClear.addEventListener("click", ()=> {
  clearRoute();
  stopVoice();
  speak("Đã hoàn thành chuyến đi. Cảm ơn quý khách.");
  cachedSteps = [];
});


btnStartVoice.addEventListener("click", ()=> startVoice());
btnStopVoice.addEventListener("click", ()=> stopVoice());

btnDark.addEventListener("click", ()=>{
  document.body.classList.toggle("light");
  // đổi tile giữa light/dark
  map.eachLayer(l=> map.removeLayer(l));
  const isLight = document.body.classList.contains("light");
  const lightTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:20});
  const darkTiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {maxZoom:20});
  tileLayer = isLight ? lightTiles : darkTiles;
  tileLayer.addTo(map);
  if(routeLine) routeLine.addTo(map);
  if(startMarker) startMarker.addTo(map);
  if(endMarker) endMarker.addTo(map);
  if(userMarker) userMarker.addTo(map);

  weather.updateUITheme(isLight);
});

btnDrivingMode.addEventListener("click", ()=>{
  document.body.classList.toggle("driving");
});

btnLocate.addEventListener("click", () => {
  if (userMarker) {
    // Lấy toạ độ pixel của marker trong map container
    const point = map.latLngToContainerPoint(userMarker.getLatLng());

    // Offset sang phải (nửa chiều rộng sidebar, ví dụ sidebar 300px → offset ~150)
    const sidebarWidth = document.querySelector(".sidebar")?.offsetWidth || 0;
    const offsetPoint = L.point(point.x + sidebarWidth / 2, point.y);

    // Chuyển lại thành LatLng để setView
    const latlng = map.containerPointToLatLng(offsetPoint);

    map.setView(latlng, 17, { animate: true });
  } else {
    toast.show("Chưa có vị trí người dùng.");
  }
});


btnRotate.addEventListener("click", ()=>{
  headingLocked = !headingLocked;
  btnRotate.textContent = headingLocked ? "🧭 Mở khóa" : "🧭 Khóa hướng";
});


/* ====== INIT RUNTIME ====== */
watchLocation();
listenDeviceOrientation();

