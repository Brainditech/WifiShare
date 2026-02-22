# WiFiShare 🚀

[![Made with React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![Built with Electron](https://img.shields.io/badge/Electron-33-333.svg)](https://www.electronjs.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF.svg)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org/)

WiFiShare is a fast, secure, and intuitive desktop application for sharing files locally over your WiFi network. Built with **React**, **Electron**, and **Vite**, it allows seamless device-to-desktop transfer without requiring an active internet connection.

## 🌟 Features

- **Blazing Fast Local Transfers**: Uses direct local network connections.
- **Cross-Platform Access**: The desktop app acts as a server. Any device (iOS, Android, Windows, Mac) with a web browser can connect using a simple QR code.
- **Modern UI/UX**: Built with a sleek, custom **Aether Design System** using Tailwind CSS.
- **Secure**: All files stay entirely on your local network.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)

### Installation & Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/wifishare.git
   cd wifishare
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run electron:dev
   ```

### Building for Production

To create a production-ready autonomous executable (Portable EXE on Windows):

```bash
npm run electron:build
```
The output file will be generated in the `release/` directory.

## 🛠️ Tech Stack

- **Frontend Core**: React 19, TypeScript, Vite
- **Styling**: TailwindCSS Custom Design System, Lucide React
- **State Management**: Zustand
- **Desktop Environment**: Electron
- **Networking**: Express (Local Web Server), WebSocket (WS), PeerJS (WebRTC)

## 👨‍💻 Author

**Zeltys**
- GitHub: [@Zeltys](https://github.com/Zeltys)
