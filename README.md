# 🚀 Vasler - Professional Proxy & Config Collector

**Vasler** is a powerful cross-platform desktop application built with **Electron** and **TypeScript** for collecting, validating, and exporting proxies and V2Ray configs from various GitHub repositories.

---

## ✨ Features

- 📥 **Collect Proxies** – HTTP, HTTPS, SOCKS4, SOCKS5, MTProto  
- 🛸 **Collect V2Ray Configs** – VMess, VLess, Trojan, Shadowsocks  
- 📂 **Repository Manager** – Add, remove, enable/disable repositories  
- 🔄 **Sync from GitHub** – Automatically fetch latest repository lists  
- ✅ **Verify Liveness** – Test proxy availability with TCP connect  
- 🚀 **Speed Test** – Test top 100 proxies and show fastest 10  
- 📡 **Config Pinger** – Ping V2Ray configs using Xray-core  
- 📋 **Results Viewer** – View collected proxies and configs with "Load More"  
- 🎨 **Dark & Light Themes** – Switch between dark and light mode  
- 🖥️ **System Tray** – Quick access from system tray  
- 📤 **Export Results** – Export to TXT, CSV, and JSON formats  
- ⬆️ **Auto Update** – Check for new versions automatically  

---

## 📸 Screenshots

| Collector | Results | Pinger |
|-----------|---------|--------|
| ![Collector](https://raw.githubusercontent.com/xenonama/vasler/main/assets/screenshot-collector.jpg) | ![Results](https://raw.githubusercontent.com/xenonama/vasler/main/assets/screenshot-results.jpg) | ![Pinger](https://raw.githubusercontent.com/xenonama/vasler/main/assets/screenshot-pinger.jpg) |

| Repositories | Settings |
|--------------|----------|
| ![Repositories](https://raw.githubusercontent.com/xenonama/vasler/main/assets/screenshot-repositories.jpg) | ![Settings](https://raw.githubusercontent.com/xenonama/vasler/main/assets/screenshot-settings.jpg) |

---

## 🚀 Installation

### **From Source**

```bash
# Clone the repository
git clone https://github.com/xenonama/vasler.git
cd vasler

# Install dependencies
npm install

# Build the project
npm run build

# Start the application
npm start
