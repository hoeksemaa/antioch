import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Three pages: Simulations (index.html), Benchmarks (benchmarks.html), and
// Gallery (gallery.html).
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        simulations: fileURLToPath(new URL("index.html", import.meta.url)),
        benchmarks: fileURLToPath(new URL("benchmarks.html", import.meta.url)),
        gallery: fileURLToPath(new URL("gallery.html", import.meta.url)),
      },
    },
  },
});
