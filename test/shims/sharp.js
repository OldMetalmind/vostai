/**
 * Test-only stub: the native sharp binary is not needed by the command tests
 * that import services/index.js, and may be unavailable in the local runner.
 */
const processor = () => {
  const chain = {
    resize: () => chain,
    composite: () => chain,
    png: () => chain,
    jpeg: () => chain,
    toBuffer: async () => Buffer.alloc(0),
    toFile: async () => ({}),
    metadata: async () => ({}),
  };

  return chain;
};

module.exports = processor;
module.exports.versions = { sharp: 'test-stub', vips: 'test-stub' };
