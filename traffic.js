// traffic.js
export class TrafficModule {
  constructor(map) {
    this.map = map;
    this.trafficLayer = null;
  }

  async fetchTrafficData() {
    // Nếu có API traffic, fetch tại đây
    // Ví dụ demo tĩnh:
    return [
      {lat: 21.028, lng: 105.854, type: "accident", desc: "Tai nạn nhẹ"},
      {lat: 10.775, lng: 106.700, type: "jam", desc: "Ùn tắc giờ cao điểm"}
    ];
  }

  async showTraffic() {
    const data = await this.fetchTrafficData();
    data.forEach(e => {
      const icon = e.type === "accident" ? "⚠️" : "🚦";
      L.marker([e.lat, e.lng], {title:e.desc})
       .addTo(this.map)
       .bindPopup(`${icon} ${e.desc}`);
    });
  }
}
