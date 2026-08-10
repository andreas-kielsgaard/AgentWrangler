const collection = "/runtime/links";

export const runtimeLinksHttp = Object.freeze({
  schemaVersion: "temporary-runtime-links-http/v1",
  paths: Object.freeze({
    collection,
    link: (target) => `${collection}/${encodeURIComponent(target)}`,
    test: (target) => `${collection}/${encodeURIComponent(target)}/test`,
  }),
});
