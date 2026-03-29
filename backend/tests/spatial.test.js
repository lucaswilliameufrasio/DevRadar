const test = require('node:test');
const assert = require('node:assert');
const RBush = require('rbush');

test('RBush spatial indexing', () => {
  const tree = new RBush();
  const item = {
    minX: -46.6333, minY: -23.5505, maxX: -46.6333, maxY: -23.5505,
    id: 'test-1'
  };

  tree.insert(item);
  
  const results = tree.search({
    minX: -46.7, minY: -23.6,
    maxX: -46.5, maxY: -23.4
  });

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, 'test-1');
});
