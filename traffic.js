export class TrafficModule {
  constructor(map, { toast = null, voiceNav = null } = {}) {
    this.map = map;
    this.toast = toast;
    this.voiceNav = voiceNav;
    this.trafficLines = [];
  }

  clearTraffic() {
    this.trafficLines.forEach(line => this.map.removeLayer(line));
    this.trafficLines = [];
  }

  showTraffic(routeCoords) {
    this.clearTraffic();

    let hasJam = false;

    for (let i = 1; i < routeCoords.length; i++) {
      const [lng1, lat1] = routeCoords[i - 1];
      const [lng2, lat2] = routeCoords[i];

      // 🔹 Random mật độ 0–100 (%)
      const trafficDensity = Math.floor(Math.random() * 100);

      let color = "green";
      let status = "Thông thoáng";

      if (trafficDensity > 70) {
        color = "red";
        status = "Kẹt xe";
        hasJam = true;
      } else if (trafficDensity >= 40) {
        color = "orange";
        status = "Đông đúc";
      }

      const line = L.polyline([[lat1, lng1], [lat2, lng2]], {
        color,
        weight: 6,
        opacity: 0.7
      }).addTo(this.map);

      // 🔹 Thêm tooltip để hover xem mật độ
      line.bindTooltip(`${status} • ${trafficDensity}%`);

      this.trafficLines.push(line);
    }

    // 🔹 Nếu có kẹt xe thì cảnh báo
    if (hasJam) {
      if (this.toast) this.toast.show("🚨 Cảnh báo: Có đoạn đường đang kẹt xe!");
      if (this.voiceNav) this.voiceNav.speak("Cảnh báo, có đoạn đường đang kẹt xe, cân nhắc thay đổi lộ trình.");
    }
  }
}
