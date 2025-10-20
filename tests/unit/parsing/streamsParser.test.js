const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { parseStreamsPage } = require('../../../src/parsing/streamsParser');

const fixturesDir = path.join(__dirname, '..', '..', 'fixtures', 'streams');

function loadFixture(name) {
    return fs.readFileSync(path.join(fixturesDir, name), 'utf8');
}

test('parseStreamsPage handles single live stream', () => {
    const html = loadFixture('streams_single_live.html');
    const parsed = parseStreamsPage(html);

    assert.equal(parsed.channelName, 'TheSilentWatcher');
    assert.equal(parsed.channelId, 'UCCkmgsl8W18oR6c_W7UZ1lQ');
    assert.equal(parsed.liveStreams.length, 1);
    assert.equal(parsed.scheduledStreams.length, 0);
    assert.equal(parsed.liveStreams[0].videoId, 'Q7zImoEl0YQ');
    assert.equal(parsed.liveStreams[0].viewerCount, 4356);
    assert.equal(parsed.liveStreams[0].viewCountText, '4,356 watching');
    assert.equal(parsed.liveStreams[0].watchUrl, 'https://www.youtube.com/watch?v=Q7zImoEl0YQ');
});

test('parseStreamsPage handles multiple live streams', () => {
    const html = loadFixture('streams_multiple_live.html');
    const parsed = parseStreamsPage(html);

    assert.equal(parsed.channelName, 'NDTV Profit');
    assert.equal(parsed.channelId, 'UC3uJIdRFTGgLWrUziaHbzrg');
    assert.ok(parsed.liveStreams.length >= 3);
    assert.equal(parsed.scheduledStreams.length, 0);
    assert.ok(parsed.liveStreams.some(stream => typeof stream.viewerCount === 'number' && stream.viewerCount >= 200));

    const missingCountEntry = parsed.liveStreams.find(stream => !('viewerCount' in stream));
    assert.ok(missingCountEntry);
});

test('parseStreamsPage handles live and scheduled streams', () => {
    const html = loadFixture('streams_live_and_scheduled.html');
    const parsed = parseStreamsPage(html);

    assert.equal(parsed.channelName, 'Firstpost');
    assert.ok(parsed.liveStreams.length >= 1);
    assert.equal(parsed.scheduledStreams.length, 1);
    assert.equal(parsed.scheduledStreams[0].videoId, 's8fnTMVKtxk');
    assert.equal(typeof parsed.scheduledStreams[0].scheduledStartTime, 'number');
    assert.ok(!('viewerCount' in parsed.scheduledStreams[0]));
});

test('parseStreamsPage captures waiting counts for scheduled streams', () => {
    const html = loadFixture('streams_many_live_one_waiting.html');
    const parsed = parseStreamsPage(html);

    assert.ok(parsed.liveStreams.length >= 5);
    assert.equal(parsed.scheduledStreams.length, 1);
    assert.equal(parsed.scheduledStreams[0].viewerCount, 2);
    assert.ok(parsed.liveStreams.every(stream => typeof stream.watchUrl === 'string' && stream.watchUrl.startsWith('https://www.youtube.com/watch')));
});

test('parseStreamsPage handles channels with no streams', () => {
    const html = loadFixture('streams_none.html');
    const parsed = parseStreamsPage(html);

    assert.equal(parsed.liveStreams.length, 0);
    assert.equal(parsed.scheduledStreams.length, 0);
    assert.equal(parsed.channelName, 'PBS Eons');
    assert.equal(parsed.channelId, 'UCzR-rom72PHN9Zg7RML9EbA');
});
