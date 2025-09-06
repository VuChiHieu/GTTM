/* ====== CONFIG ====== */
const OPENWEATHER_KEY = "fc77d3dc7e2bd53cd1b7fc88dd579d85";
const OSRM_SERVER = "https://router.project-osrm.org"; // server Việt Nam

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

/* ====== MAP ====== */
let map, tileLayer, routeLine, startMarker, endMarker, userMarker, headingLocked = false;
let currentHeading = 0;
let watchId = null;

initMap();

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
let cachedSteps = [];
let stepIndex = 0;
let voiceTimer = null;

function speak(text){
  if(!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  // chọn giọng Việt nếu có
  const viVoice = speechSynthesis.getVoices().find(v=>/vi|Vietnam/i.test(v.lang));
  if(viVoice) u.voice = viVoice;
  u.lang = viVoice?.lang || "vi-VN";
  u.rate = 1; u.pitch=1;
  window.speechSynthesis.speak(u);
}

function startVoice(){
  if(!cachedSteps.length){ alert("Chưa có lộ trình để đọc hướng dẫn."); return; }
  speaking = true;
  stepIndex = 0;
  if(voiceTimer) clearInterval(voiceTimer);
  speak("Bắt đầu hành trình. Giữ an toàn khi lái xe.");
  voiceTimer = setInterval(()=>{
    if(!speaking){ clearInterval(voiceTimer); return; }
    if(stepIndex < cachedSteps.length){
      const s = cachedSteps[stepIndex];
      const instr = s.maneuver?.instruction || "Tiếp tục đi thẳng";
      speak(instr);
      stepIndex++;
    }else{
      speak("Bạn đã đến nơi. Kết thúc hành trình.");
      clearInterval(voiceTimer);
      speaking = false;
    }
  }, 8000); // đọc mỗi 8s (đơn giản cho demo). Bước sau sẽ cải tiến theo khoảng cách còn lại.
}

function stopVoice(){
  speaking = false;
  if(voiceTimer) clearInterval(voiceTimer);
  if("speechSynthesis" in window) window.speechSynthesis.cancel();
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

function watchLocation(){
  if(!navigator.geolocation){
    statusGPS.textContent = "GPS: không hỗ trợ";
    return;
  }
  if(watchId) navigator.geolocation.clearWatch(watchId);

  watchId = navigator.geolocation.watchPosition(pos=>{
    const {latitude, longitude, heading, speed} = pos.coords;
    statusGPS.textContent = `GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    if(typeof speed === "number" && !Number.isNaN(speed)){
      statusSpeed.textContent = `Tốc độ ~ ${(speed*3.6).toFixed(0)} km/h`;
    }else{
      statusSpeed.textContent = "Tốc độ ~ — km/h";
    }

    if(typeof heading === "number" && !Number.isNaN(heading)){
      currentHeading = heading; // degrees
      statusHeading.textContent = `Hướng ${currentHeading.toFixed(0)}°`;
    }

    updateUserMarker(latitude, longitude);
    if(headingLocked){
      map.setView([latitude, longitude], map.getZoom(), {animate:true});
    }
  }, err=>{
    statusGPS.textContent = "GPS: lỗi/không cấp quyền";
    console.warn(err);
  }, {
    enableHighAccuracy:true,
    timeout:10000,
    maximumAge:5000
  });
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
btnUseMyLocation.addEventListener("click", ()=>{
  if(!navigator.geolocation){ alert("Trình duyệt không hỗ trợ GPS."); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude, longitude} = pos.coords;
    elFrom.value = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    map.setView([latitude, longitude], 15);
    updateUserMarker(latitude, longitude);
  }, ()=> alert("Không lấy được vị trí của bạn."), {enableHighAccuracy:true});
});

btnRoute.addEventListener("click", async ()=>{
  try{
    const from = parseLatLng(elFrom.value);
    const to = parseLatLng(elTo.value);
    if(!from || !to){
      alert("Vui lòng nhập tọa độ dạng 'lat,lng' cho demo này.\n(Bước sau sẽ thêm Autocomplete địa chỉ)");
      return;
    }
    clearRoute();
    const route = await getRoute(from, to);
    drawRoute(route, from, to);
  }catch(err){
    console.error(err);
    alert("Không tính được lộ trình. Kiểm tra OSRM server hoặc dữ liệu đầu vào.");
  }
});

btnClear.addEventListener("click", ()=>{
  clearRoute();
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
    alert("Chưa có vị trí người dùng.");
  }
});


btnRotate.addEventListener("click", ()=>{
  headingLocked = !headingLocked;
  btnRotate.textContent = headingLocked ? "🧭 Mở khóa" : "🧭 Khóa hướng";
});


function toggleDrivingMode() {
  if (!watchId) {
    // Bật chế độ theo dõi vị trí
    watchId = navigator.geolocation.watchPosition(pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const latlng = [lat, lng];

      // Di chuyển map theo vị trí người dùng
      map.setView(latlng, 15);

      // (tùy chọn) thêm marker
      if (!userMarker) {
        userMarker = L.marker(latlng).addTo(map);
      } else {
        userMarker.setLatLng(latlng);
      }
    });
  } else {
    // Tắt chế độ driving
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

document.getElementById("btnUseMyLocation").addEventListener("click", () => {
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    // Gán vào input điểm bắt đầu
    document.getElementById("startPoint").value = `${lat},${lng}`;

    // Đặt marker trên bản đồ
    if (!userMarker) {
      userMarker = L.marker([lat, lng]).addTo(map);
    } else {
      userMarker.setLatLng([lat, lng]);
    }

    map.setView([lat, lng], 15);
  }, err => {
    alert("Không lấy được vị trí hiện tại: " + err.message);
  });
});


/* ====== INIT RUNTIME ====== */
watchLocation();
listenDeviceOrientation();

/* ====== GỢI Ý TEST NHANH ======
1) Bấm 📍 Dùng vị trí tôi -> điền From
2) Nhập To = "10.775,106.700" (quận 1, HCM) hoặc "21.028,105.854" (Hà Nội) -> Tính lộ trình
3) Bấm 🔊 Bắt đầu giọng nói
4) Bật 🚘 Driving để xem giao diện lái
================================ */
