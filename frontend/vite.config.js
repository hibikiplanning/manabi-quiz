import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 開発中は /api を Python の API（8787番）へ中継する。
// 画面とAPIが同じ場所にあるように見えるので、CORS を気にせず書ける。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
