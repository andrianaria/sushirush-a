import test from 'node:test';
import assert from 'node:assert/strict';

test('local browser vendors expose the React and Three APIs used by the original game', async () => {
  const [react, jsx, client, three, geometry] = await Promise.all([
    import('../vendor/browser/react.js'), import('../vendor/browser/jsx-runtime.js'),
    import('../vendor/browser/react-dom-client.js'), import('../vendor/browser/three.js'),
    import('../vendor/browser/three-buffer-geometry.js'),
  ]);
  assert.equal(typeof react.useState, 'function');
  assert.equal(typeof jsx.jsx, 'function');
  assert.equal(typeof jsx.Fragment, 'symbol');
  assert.equal(typeof client.createRoot, 'function');
  assert.equal(typeof three.WebGLRenderer, 'function');
  assert.equal(typeof geometry.mergeGeometries, 'function');
});

test('the compiled original frontend resolves every local module before browser startup', async () => {
  const app = await import('../browser/App.js');
  const scene = await import('../browser/components/KitchenScene.js');
  assert.equal(typeof app.default, 'function');
  assert.equal(typeof scene.default, 'function');
});
