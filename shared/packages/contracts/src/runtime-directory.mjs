export const runtimeDirectoryHttp = Object.freeze({
  paths: Object.freeze({
    collection: "/durable/runtime-directory",
    runtime: (id) => `/durable/runtime-directory/${encodeURIComponent(id)}`,
  }),
});

export const directoryRuntimeIds = Object.freeze(["ranch", "router", "gallery"]);
