// weather.js
export class WeatherModule {
  constructor(map, apiKey, toast, voiceNav) {
    this.map = map;
    this.apiKey = apiKey;
    this.toast = toast;
    this.voiceNav = voiceNav;
    this.markers = [];
    this.container = null;
    this.initUI();
  }

  initUI() {
    const actionRow = document.querySelector(".actions-row");
    this.container = document.createElement("div");
    this.container.id = "weatherInfo";
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(50,50,50,0.8);
      color: #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    `;
    actionRow.appendChild(this.container);
  }

  updateUITheme(isLight) {
    if (!this.container) return;
    this.container.style.background = isLight ? "rgba(255,255,255,0.8)" : "rgba(50,50,50,0.8)";
    this.container.style.color = isLight ? "#000" : "#fff";
  }

  async updateCurrent(lat, lng) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&lang=vi&appid=${this.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Không lấy được dữ liệu thời tiết");
      const data = await res.json();
      this.showCurrent(data);
    } catch (e) {
      this.container.textContent = "❌ Không lấy được thời tiết";
      console.error(e);
    }
  }

  showCurrent(data) {
    const iconMap = {
      "Clear": "☀️",
      "Clouds": "⛅",
      "Rain": "🌧️",
      "Thunderstorm": "⚡",
      "Snow": "❄️",
      "Drizzle": "🌦️",
      "Mist": "🌫️",
      "Fog": "🌫️",
      "Haze": "🌫️"
    };
    const icon = iconMap[data.weather[0].main] || "🌡️";
    const temp = Math.round(data.main.temp);
    const desc = data.weather[0].description;
    this.container.textContent = `${icon} ${temp}°C • ${desc}`;
  }

  addMarker(lat, lng, forecast = null) {
    this.markers.push({ lat, lng, forecast, alertCount: 0, lastAlertTime: 0 });
  }

  clearMarkers() {
    this.markers = [];
  }

  // Kiểm tra cảnh báo khi xe di chuyển
  checkAlerts(userLat, userLng) {
    const toRad = deg => deg * Math.PI / 180;
    const distance = (lat1, lng1, lat2, lng2) => {
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const alertMap = {
      "Rain": "⚠️ Gần đây đang mưa, hãy cẩn thận!",
      "Thunderstorm": "⚠️ Giông bão, cân nhắc dừng xe!",
      "Snow": "⚠️ Tuyết rơi, đường trơn trượt!",
      "Mist": "⚠️ Sương mù, giảm tốc độ!",
      "Fog": "⚠️ Sương mù, giảm tốc độ!",
      "Haze": "⚠️ Khói mù, giảm tốc độ!"
    };

    let nearestMarker = null;
    let minDist = Infinity;

    this.markers.forEach(m => {
      if (m.alertCount >= 3) return;
      const d = distance(userLat, userLng, m.lat, m.lng);
      if (d <= 3 && d < minDist) {
        minDist = d;
        nearestMarker = m;
      }
    });

    if (nearestMarker) {
      const now = Date.now();
      if (!nearestMarker.lastAlertTime || (now - nearestMarker.lastAlertTime >= 10000)) {
        const forecast = nearestMarker.forecast;
        const msg = forecast && alertMap[forecast] ? alertMap[forecast] : "⚠️ Cảnh báo thời tiết trên tuyến đường!";
        if (this.toast) this.toast.show(msg);
        if (this.voiceNav) this.voiceNav.speak(msg);

        nearestMarker.alertCount += 1;
        nearestMarker.lastAlertTime = now;
      }
    }
  }

  // Cảnh báo khi vừa tính xong route
  async showRouteAlert(routeCoords = null, { maxPoints = 20 } = {}) {
    if (!routeCoords || !Array.isArray(routeCoords) || routeCoords.length === 0) {
      return;
    }

    this.clearMarkers();

    const step = Math.max(1, Math.ceil(routeCoords.length / maxPoints));
    const samples = [];
    for (let i = 0; i < routeCoords.length; i += step) {
      const c = routeCoords[i];
      samples.push([c[1], c[0]]); // [lat,lng]
    }

    const alertMap = {
      "Rain": "⚠️ Gần đây đang mưa, hãy cẩn thận!",
      "Thunderstorm": "⚠️ Giông bão, cân nhắc dừng xe!",
      "Snow": "⚠️ Tuyết rơi, đường trơn trượt!",
      "Mist": "⚠️ Sương mù, giảm tốc độ!",
      "Fog": "⚠️ Sương mù, giảm tốc độ!",
      "Haze": "⚠️ Khói mù, giảm tốc độ!"
    };

    let alertsFound = 0;

    for (const [lat, lng] of samples) {
      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&lang=vi&appid=${this.apiKey}`;
        const res = await fetch(url);
        if (!res.ok) {
          this.addMarker(lat, lng, null);
          continue;
        }
        const data = await res.json();
        const main = data.weather?.[0]?.main || null;
        this.addMarker(lat, lng, main);
        if (main && alertMap[main]) alertsFound += 1;
        await new Promise(r => setTimeout(r, 150)); // throttle
      } catch (e) {
        console.error("Weather fetch err:", e);
        this.addMarker(lat, lng, null);
      }
    }

    if (alertsFound > 0) {
      const msg = `⚠️ Phát hiện ${alertsFound} khu vực có thời tiết xấu trên tuyến đường!`;
      if (this.toast) this.toast.show(msg);
      if (this.voiceNav) this.voiceNav.speak(msg);
    }
  }
}
