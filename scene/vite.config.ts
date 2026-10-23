import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Two pages: Simulations (index.html) and Benchmarks (benchmarks.html).
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        simulations: fileURLToPath(new URL("index.html", import.meta.url)),
        benchmarks: fileURLToPath(new URL("benchmarks.html", import.meta.url)),
      },
    },
  },
});
