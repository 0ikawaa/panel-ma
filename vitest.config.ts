import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // Mismo alias que el tsconfig, para poder testear también los módulos que
    // importan con "@/" (hasta ahora sólo se podía testear lógica sin imports).
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
