'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// assets/app.js only exports anything when `typeof document === 'undefined'`
// (see the guard near the top of that file) — that's what makes this
// require() safe to do outside a browser at all.
const app = require('../../assets/app.js');

test('hexToRgb parses a 6-digit hex color', () => {
  assert.deepEqual(app.hexToRgb('#2f83e0'), [47, 131, 224]);
});

test('hexToRgb expands a 3-digit hex color', () => {
  assert.deepEqual(app.hexToRgb('#fff'), [255, 255, 255]);
});

test('lerpColor at t=0 returns the first color exactly', () => {
  assert.equal(app.lerpColor('#2f83e0', '#8f8f85', 0), 'rgb(47,131,224)');
});

test('lerpColor at t=1 returns the second color exactly', () => {
  assert.equal(app.lerpColor('#2f83e0', '#8f8f85', 1), 'rgb(143,143,133)');
});

test('lerpColor at t=0.5 is the rounded midpoint', () => {
  assert.equal(app.lerpColor('#000000', '#ffffff', 0.5), 'rgb(128,128,128)');
});

// The three colors below are the app's real dark-mode --temp-cold/mid/warm
// tokens, and every expected rgb() string here is a value hand-verified via
// the browser console earlier in the project — this locks those in.
const COLD = '#2f83e0', MID = '#8f8f85', WARM = '#e2793f';

test('tempToColor at the coldest edge of the domain returns the cold color exactly', () => {
  assert.equal(app.tempToColor(-16, COLD, MID, WARM), 'rgb(47,131,224)');
});

test('tempToColor at freezing returns the neutral midpoint color exactly', () => {
  assert.equal(app.tempToColor(0, COLD, MID, WARM), 'rgb(143,143,133)');
});

test('tempToColor at the warmest edge of the domain returns the warm color exactly', () => {
  assert.equal(app.tempToColor(20, COLD, MID, WARM), 'rgb(226,121,63)');
});

test('tempToColor clamps past the domain rather than extrapolating', () => {
  assert.equal(app.tempToColor(-40, COLD, MID, WARM), app.tempToColor(-16, COLD, MID, WARM));
  assert.equal(app.tempToColor(40, COLD, MID, WARM), app.tempToColor(20, COLD, MID, WARM));
});

test('tempToColor at -8C matches the exact value this stayed at after the squared-easing fix', () => {
  // -8C is the linear midpoint between -16 and 0, but the squared easing
  // keeps it closer to the cold pole than a straight 50/50 blend would —
  // this is the exact contrast-fix regression test.
  assert.equal(app.tempToColor(-8, COLD, MID, WARM), 'rgb(71,134,201)');
});

test('depthToRadius floors at 60% of the minimum radius for 0cm', () => {
  assert.equal(app.depthToRadius(0), 6.5 * 0.6);
});

test('depthToRadius treats anything at or under the hollow-ring threshold as zero', () => {
  assert.equal(app.depthToRadius(0.05), 6.5 * 0.6);
});

test('depthToRadius scales area (not radius) with depth: 4x depth is 2x the radius above the floor', () => {
  const floor = 6.5;
  const r1 = app.depthToRadius(50);
  const r2 = app.depthToRadius(200);
  assert.ok(Math.abs((r2 - floor) / (r1 - floor) - 2) < 1e-9);
});

test('depthToRadius reaches the maximum radius at the domain ceiling', () => {
  assert.equal(app.depthToRadius(300), 15);
});

test('depthToRadius clamps above the domain ceiling rather than growing further', () => {
  assert.equal(app.depthToRadius(1000), app.depthToRadius(300));
});

test('fmtDate formats an ISO date as a short month and day', () => {
  assert.equal(app.fmtDate('2026-02-14'), 'Feb 14');
});

test('fmtFetched includes the date and time from an Open-Meteo timestamp', () => {
  const label = app.fmtFetched('2026-02-14T21:45');
  assert.match(label, /Feb 14/);
  assert.match(label, /9:45/);
});

// Regression tests for GitHub issue #1: the map hover tooltip could render
// past the bottom (or side) of the viewport, since it always placed itself
// below-and-right of the cursor with no check for whether that fit.
test('computeTooltipPosition places the tooltip below and right of the cursor when there is room', () => {
  const pos = app.computeTooltipPosition(300, 400, 220, 99, 1200, 900, 14);
  assert.deepEqual(pos, { x: 314, y: 414 });
});

test('computeTooltipPosition flips above the cursor when the default position would overflow the bottom', () => {
  // viewport is only 450 tall; cursor at y=400 + 99 tall tooltip + 14 margin
  // would end at 513, past the bottom, so it should flip above instead
  const pos = app.computeTooltipPosition(300, 400, 220, 99, 1200, 450, 14);
  assert.equal(pos.y, 400 - 99 - 14);
  assert.ok(pos.y + 99 <= 450, 'flipped tooltip should fit within the viewport height');
});

test('computeTooltipPosition flips left of the cursor when the default position would overflow the right edge', () => {
  const pos = app.computeTooltipPosition(1100, 400, 220, 99, 1200, 900, 14);
  assert.equal(pos.x, 1100 - 220 - 14);
  assert.ok(pos.x + 220 <= 1200, 'flipped tooltip should fit within the viewport width');
});

test('computeTooltipPosition clamps to a small margin when the viewport is too small to fit the tooltip on either side', () => {
  // a 110x50 viewport is smaller than the 220x99 tooltip in both dimensions,
  // so both the default position and the flipped position overflow — it
  // should clamp to a small positive margin rather than go negative
  const pos = app.computeTooltipPosition(5, 5, 220, 99, 110, 50, 14);
  assert.deepEqual(pos, { x: 4, y: 4 });
});
