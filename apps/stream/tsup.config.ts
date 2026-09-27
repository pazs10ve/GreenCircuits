import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  noExternal: [/^@greencircuits\//],
  // Native addon: loaded from node_modules at runtime, never bundled.
  external: ["uWebSockets.js"],
})
