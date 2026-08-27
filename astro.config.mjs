import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import netlify from "@astrojs/netlify";
import node from "@astrojs/node";


const serverAdapterMode = process.env.SERVER_ADAPTER_MODE || "node";
let adapter;
if (serverAdapterMode === "node") {
  console.log("Using node adapter");
  adapter = node({ mode: "standalone" });
} else {
  console.log("Using netlify adapter");
  adapter = netlify();
}

export default defineConfig({
  output: "server",
  adapter,
  integrations: [react(), tailwind()],
  vite: {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
