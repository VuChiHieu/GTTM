// toast.js
export class Toast {
  constructor() {
    this.container = document.createElement("div");
    this.container.className = "toast-container";
    document.body.appendChild(this.container);
  }

  show(message, type="info", duration=3000) {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.container.appendChild(toast);

    // show animation
    requestAnimationFrame(() => toast.classList.add("show"));

    // hide after duration
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => this.container.removeChild(toast), 300);
    }, duration);
  }
}

// export 1 instance sẵn dùng
export const toast = new Toast();
