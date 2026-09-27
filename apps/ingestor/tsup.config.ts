import { defineConfig } from "tsup"

// One file per service: workspace packages ship TypeScript source, so they are bundled in.
export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  noExternal: [/^@greencircuits\//],
})
