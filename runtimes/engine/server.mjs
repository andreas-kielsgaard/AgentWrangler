import { readPort } from "@agent-wrangler/http-transport";
import { startRuntime } from "@agent-wrangler/runtime-diagnostics";

const port = readPort("ENGINE_PORT", 4104);

startRuntime({
  id: "engine",
  name: "Wrangle Engine",
  port,
});
