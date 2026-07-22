// Runnable with: node --test shared/
// The smallest set of cases that fail if the alert rules break.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAlerts, inBreach, DEFAULT_SETTINGS } from './alerts.mjs';

const MIN = 60_000;
const settings = { ...DEFAULT_SETTINGS, planDown: 1000, planUp: 100, gThreshold: 60, gMinThreshold: 30, gMaxDrop: 70 };
// => guaranteed floor 600/60, large-drop floor 300/30.

const t0 = Date.parse('2026-07-01T00:00:00Z');
const good = (i, over = {}) => ({ t: t0 + i * 20 * MIN, download: 900, upload: 90, ping: 12, jitter: 2, loss: 0, ...over });

test('healthy samples produce no alerts', () => {
	assert.deepEqual(computeAlerts(Array.from({ length: 20 }, (_, i) => good(i)), settings), []);
});

test('a brief dip below the guaranteed floor is noise, not an alert', () => {
	// Two samples = 20 min, well under the 70-min sustained window.
	const points = [good(0), good(1, { download: 500 }), good(2, { download: 500 }), good(3)];
	assert.deepEqual(computeAlerts(points, settings), []);
});

test('a dip held past the sustained window is a warning', () => {
	// Five samples spanning 80 min > gMaxDrop.
	const points = [good(0), ...Array.from({ length: 5 }, (_, i) => good(i + 1, { download: 500 })), good(6)];
	const [alert] = computeAlerts(points, settings);
	assert.equal(alert.kind, 'sustained');
	assert.equal(alert.sev, 'warning');
	assert.equal(alert.metric, 'download');
});

test('a collapse below the large-drop floor alerts immediately, no waiting window', () => {
	const points = [good(0), good(1, { download: 40, upload: 4 }), good(2)];
	const [alert] = computeAlerts(points, settings);
	assert.equal(alert.kind, 'outage');
	assert.equal(alert.sev, 'critical');
	assert.equal(alert.metric, 'both');
	assert.equal(alert.params.floor, 300, 'large-drop floor is 30% of 1000');
});

test('loss and latency spikes during an outage are not reported twice', () => {
	const points = [good(0), good(1, { download: 40, upload: 4, loss: 12, ping: 300 }), good(2)];
	const alerts = computeAlerts(points, settings);
	assert.equal(alerts.length, 1, 'one incident, not three');
	assert.equal(alerts[0].kind, 'outage');
});

test('a loss spike on its own is still reported', () => {
	const points = [good(0), good(1, { loss: 9 }), good(2)];
	const [alert] = computeAlerts(points, settings);
	assert.equal(alert.kind, 'loss');
});

test('ids are stable, so acknowledgements survive recomputation', () => {
	const points = [good(0), good(1, { download: 40 }), good(2)];
	const first = computeAlerts(points, settings);
	const again = computeAlerts([...points, good(3)], settings);
	assert.equal(first[0].id, again[0].id);
});

test('inBreach reads the guaranteed floor, not the large-drop floor', () => {
	assert.equal(inBreach(good(0), settings), false);
	assert.equal(inBreach(good(0, { download: 500 }), settings), true);
	assert.equal(inBreach(good(0, { upload: 50 }), settings), true);
	assert.equal(inBreach(undefined, settings), false);
});
