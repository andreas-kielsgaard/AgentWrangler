import { readPort } from "@agent-wrangler/http-transport";
import { startRuntime } from "@agent-wrangler/runtime-diagnostics";

const port = readPort("GALLERY_PORT", 4102);

startRuntime({
  id: "gallery",
  name: "Wrangle Gallery",
  port,
  capabilities: { operations: ["runtime.identity", "runtime.health"], dependencies: [] },
});
