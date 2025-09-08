// weather.js

window.DEMO_MODE = false;

window.fakeWeatherList = ["Rain", "Thunderstorm", "Mist", "Fog", "Clear"];
window.getFakeWeather = function () {
  return fakeWeatherList[Math.floor(Math.random() * fakeWeatherList.length)];
};

export class WeatherModule {
  constructor(map, apiKey, toast, voiceNav) {
    this.map = map;
    this.apiKey = apiKey;
    this.toast = toast;
    this.voiceNav = voiceNav;
    this.markers = [];
    this.container = null;

    this.alertMap = {
      "Rain":        { msg: "⚠️ Gần đây đang mưa, hãy cẩn thận!", priority: 2, color: "orange" },
      "Thunderstorm":{ msg: "⚠️ Giông bão, cân nhắc dừng xe!", priority: 3, color: "red" },
      "Snow":        { msg: "⚠️ Tuyết rơi, đường trơn trượt!", priority: 3, color: "red" },
      "Mist":        { msg: "⚠️ Sương mù, giảm tốc độ!", priority: 1, color: "gray" },
      "Fog":         { msg: "⚠️ Sương mù, giảm tốc độ!", priority: 1, color: "gray" },
      "Haze":        { msg: "⚠️ Khói mù, giảm tốc độ!", priority: 1, color: "gray" }
    };

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

    let main = data.weather?.[0]?.main || null;

    //Chế độ Demo ép giả lập thời tiết
    if (window.DEMO_MODE) {
      main = window.getFakeWeather();
      data.weather[0].main = main;
      data.weather[0].description = `(${main}) demo`;
    }

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
    const alertInfo = forecast && this.alertMap[forecast] ? this.alertMap[forecast] : null;
    const color = alertInfo ? alertInfo.color : "green";

    // thêm marker trực quan trên bản đồ
    if (this.map && L) {
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: color,
        fillColor: color,
        fillOpacity: 0.7
      }).addTo(this.map);

      this.markers.push({ lat, lng, forecast, alertCount: 0, lastAlertTime: 0, marker });
    } else {
      this.markers.push({ lat, lng, forecast, alertCount: 0, lastAlertTime: 0 });
    }
  }

  clearMarkers() {
    if (this.map && L) {
      this.markers.forEach(m => {
        if (m.marker && this.map.hasLayer(m.marker)) {
          this.map.removeLayer(m.marker);
        }
      });
    }
    this.markers = [];
  }

  // 🔔 Kiểm tra cảnh báo khi xe di chuyển
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
        const alertInfo = forecast && this.alertMap[forecast] ? this.alertMap[forecast].msg : "⚠️ Cảnh báo thời tiết trên tuyến đường!";
        
        if (this.toast) this.toast.show(alertInfo);
        if (this.voiceNav) this.voiceNav.speak(alertInfo);

        nearestMarker.alertCount += 1;
        nearestMarker.lastAlertTime = now;
      }
    }
  }

  async showRouteAlert(routeCoords = null, { maxPoints = 20 } = {}) {
    if (!routeCoords || !Array.isArray(routeCoords) || routeCoords.length === 0) return;

    this.clearMarkers();

    const step = Math.max(1, Math.ceil(routeCoords.length / maxPoints));
    const samples = [];
    for (let i = 0; i < routeCoords.length; i += step) {
      const c = routeCoords[i];
      samples.push([c[1], c[0]]); // [lat,lng]
    }

    let alertsFound = [];

    for (const [lat, lng] of samples) {
      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&lang=vi&appid=${this.apiKey}`;
        const res = await fetch(url);
        if (!res.ok) {
          this.addMarker(lat, lng, null);
          continue;
        }
        const data = await res.json();

        let main = data.weather?.[0]?.main || null;

        // 👉 Nếu bật DEMO_MODE thì ép thời tiết ngẫu nhiên
        if (window.DEMO_MODE) {
          main = window.getFakeWeather();
        }

        this.addMarker(lat, lng, main);
        if (main && this.alertMap[main]) alertsFound.push(this.alertMap[main]);
        await new Promise(r => setTimeout(r, 150)); // throttle
      } catch (e) {
        console.error("Weather fetch err:", e);
        this.addMarker(lat, lng, null);
      }
    }

    if (alertsFound.length > 0) {
      // 👉 lấy thông báo cảnh báo quan trọng nhất
      const highest = alertsFound.sort((a, b) => b.priority - a.priority)[0];
      const msg = `⚠️ Có ${alertsFound.length} khu vực có thời tiết xấu. ${highest.msg}`;
      if (this.toast) this.toast.show(msg);
      if (this.voiceNav) this.voiceNav.speak(msg);
    }
  }
}
