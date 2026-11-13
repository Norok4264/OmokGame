import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {filesIn,pwaBuild} from "./pwa-build.js";

export default defineConfig(async({command,mode})=>{
  const root=fileURLToPath(new URL(".",import.meta.url));
  const hash=createHash("sha256");hash.update(command+mode);
  for(const file of ["vite.config.ts","pwa-build.ts","index.html","../../package-lock.json"])hash.update(await readFile(new URL(file,import.meta.url)));
  for(const folder of ["src","public","../../packages/shared/src"]){for(const path of await filesIn(fileURLToPath(new URL(folder+"/",import.meta.url))))hash.update(await readFile(path));}
  const version="0.1.0-"+hash.digest("hex").slice(0,16);
  return {
  plugins: [react(),pwaBuild(root,version)],
  define:{__PWA_BUILD__:JSON.stringify(version)},
  server: {
    host: process.env.OMOK_VITE_HOST ?? "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, ""),
      },
      "/ws": {target:"ws://127.0.0.1:3001",ws:true},
    },
  },
};});
