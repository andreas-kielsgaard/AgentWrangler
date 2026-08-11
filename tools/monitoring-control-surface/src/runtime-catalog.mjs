export const runtimeCatalog = Object.freeze([
  Object.freeze({ owner: "ranch", runtimeId: "ranch", name: "Wrangle Ranch", port: 4101 }),
  Object.freeze({ owner: "gallery", runtimeId: "gallery", name: "Wrangle Gallery", port: 4102 }),
  Object.freeze({ owner: "router", runtimeId: "router", name: "Wrangle Router", port: 4103 }),
  Object.freeze({ owner: "engine", runtimeId: "engine", name: "Wrangle Engine", port: 4104 }),
  Object.freeze({ owner: "farm", runtimeId: "farm", name: "Wrangler Farm", port: 4105 }),
  Object.freeze({ owner: "durable-data", runtimeId: "authority-server", name: "Durable Data Server", port: 4106 }),
  Object.freeze({ owner: "execution-node", runtimeId: "execution-node", name: "Execution Node", port: 4110 }),
]);

export const runtimeByOwner = new Map(runtimeCatalog.map((runtime) => [runtime.owner, runtime]));
export const runtimeById = new Map(runtimeCatalog.map((runtime) => [runtime.runtimeId, runtime]));

export function requireRuntimeOwner(owner) {
  const runtime = runtimeByOwner.get(owner);
  if (!runtime) throw requestError(400, `Unknown runtime '${owner}'.`);
  return runtime;
}

export function requestError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

