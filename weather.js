// weather.js
export class WeatherModule {
  constructor(map, apiKey, toast, voiceNav) {
    this.map = map;
    this.apiKey = apiKey;
    this.toast = toast;
    this.voiceNav = voiceNav;
    this.markers = [];          // lưu các điểm dự báo
    this.container = null;      
    this.initUI();
  }

  // Tạo UI hiển thị thời tiết hiện tại trong action-row
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
      background: rgba(255,255,255,0.8);
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      transition: background 0.3s, color 0.3s;
    `;
    actionRow.appendChild(this.container);
  }

  // Cập nhật nền/dark mode
  updateUITheme(isLight) {
    if (!this.container) return;
    this.container.style.background = isLight ? "rgba(255,255,255,0.8)" : "rgba(50,50,50,0.8)";
    this.container.style.color = isLight ? "#000" : "#fff";
  }

  // Lấy dữ liệu thời tiết hiện tại
  async updateCurrent(lat, lng) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&lang=vi&appid=${this.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Không lấy được dữ liệu thời tiết");
      const data = await res.json();
      this.showCurrent(data);
    } catch(e) {
      this.container.textContent = "❌ Không lấy được thời tiết";
      console.error(e);
    }
  }

  // Hiển thị weather hiện tại
  showCurrent(data) {
    const iconMap = {
      "Clear": "☀️",
      "Clouds": "⛅",
      "Rain": "🌧️",
      "Thunderstorm": "⚡",
      "Snow": "❄️",
      "Drizzle": "🌦️",
      "Mist": "🌫️"
    };
    const icon = iconMap[data.weather[0].main] || "🌡️";
    const temp = Math.round(data.main.temp);
    const desc = data.weather[0].description;
    this.container.textContent = `${icon} ${temp}°C • ${desc}`;
    this.container.title = `Thời tiết hiện tại: ${desc}, ${temp}°C`;
  }

  // Thêm điểm dự báo lộ trình, chỉ dùng để check alert, không hiển thị marker rối mắt
  addMarker(lat, lng, forecast = null) {
    this.markers.push({ lat, lng, forecast, alertCount: 0 });
  }

  clearMarkers() {
    this.markers = [];
  }

  // Kiểm tra alert realtime khi user di chuyển
  checkAlerts(userLat, userLng) {
    if (!this.markers.length) return;

    const toRad = deg => deg * Math.PI / 180;
    const distance = (lat1, lng1, lat2, lng2) => {
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    this.markers.forEach(m => {
      if (m.alertCount >= 3) return; // tối đa 3 lần cảnh báo
      const d = distance(userLat, userLng, m.lat, m.lng);
      if (d <= 3) { // trong 3km
        const msg = m.forecast || "⚠️ Có khả năng mưa trên tuyến đường gần đây!";
        if (this.toast) this.toast.show(msg);
        if (this.voiceNav) this.voiceNav.speak(msg);
        m.alertCount += 1;
      }
    });
  }

  // demo route alert, dùng khi route vừa tính xong
  showRouteAlert() {
    console.log("Route alert ready");
  }
}
