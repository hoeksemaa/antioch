import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Two pages: the 3D scene (index.html) and the results page (results.html).
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        scene: fileURLToPath(new URL("index.html", import.meta.url)),
        results: fileURLToPath(new URL("results.html", import.meta.url)),
      },
    },
  },
});
