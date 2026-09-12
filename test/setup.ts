// happy-dom may lack blob URL support; provide a minimal fallback.
if (typeof URL.createObjectURL !== "function") {
  let counter = 0;
  Object.defineProperty(URL, "createObjectURL", {
    value: (blob: Blob) => `blob:mock-${++counter}-${blob.size}`,
    configurable: true,
  });
}
if (typeof URL.revokeObjectURL !== "function") {
  Object.defineProperty(URL, "revokeObjectURL", {
    value: () => {},
    configurable: true,
  });
}
