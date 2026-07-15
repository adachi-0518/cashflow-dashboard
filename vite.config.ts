import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages のプロジェクトページは /<リポジトリ名>/ の下に配信されるため、
// 本番ビルドだけサブパス基準にする。ローカルの dev サーバーは / のままでよい。
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/cashflow-dashboard/" : "/",
  plugins: [react()],
}));
