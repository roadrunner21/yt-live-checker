const test = require('node:test');
const assert = require('node:assert/strict');

const { parseViewerCount } = require('../src/parsing/viewerCount');

test('parseViewerCount handles plain numbers', () => {
    assert.equal(parseViewerCount('1,234 watching'), 1234);
    assert.equal(parseViewerCount('27 waiting'), 27);
});

test('parseViewerCount handles suffixes', () => {
    assert.equal(parseViewerCount('1.2K watching'), 1200);
    assert.equal(parseViewerCount('3.45M waiting'), 3450000);
    assert.equal(parseViewerCount('0.5B watching'), 500000000);
});

test('parseViewerCount tolerates dot thousand separators', () => {
    assert.equal(parseViewerCount('1.234 watching'), 1234);
});

test('parseViewerCount returns null for non-numeric text', () => {
    assert.equal(parseViewerCount('Scheduled for Oct 21, 2025'), null);
    assert.equal(parseViewerCount('Waiting for premiere'), null);
    assert.equal(parseViewerCount('Members only'), null);
    assert.equal(parseViewerCount(undefined), null);
});
