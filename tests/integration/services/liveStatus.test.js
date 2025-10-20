const test = require('node:test');
const assert = require('node:assert/strict');
const nock = require('nock');
const path = require('path');
const fs = require('fs');

const { checkChannelLiveStatus } = require('../../../src/services/liveStatus');

nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

const fixturesDir = path.join(__dirname, '..', '..', 'fixtures', 'streams');

const LOGGER_STUB = {
    info: () => {},
    debug: () => {},
    error: () => {},
    warn: () => {},
};

function mockHandle(handle, channelId) {
    const html = `<html><head><meta itemprop="identifier" content="${channelId}"></head></html>`;
    nock('https://www.youtube.com')
        .get(`/${handle}`)
        .reply(200, html);
}

function mockStreams(channelId, fixtureName) {
    const html = fs.readFileSync(path.join(fixturesDir, fixtureName), 'utf8');
    nock('https://www.youtube.com')
        .get(`/channel/${channelId}/streams`)
        .reply(200, html);
}

test.afterEach(() => {
    nock.cleanAll();
});

test.after(() => {
    nock.enableNetConnect();
});

test('checkChannelLiveStatus returns live result with scheduled streams', async() => {
    const handle = '@Firstpost';
    const channelId = 'UCz8QaiQxApLq8sLNcszYyJw';

    mockHandle(handle, channelId);
    mockStreams(channelId, 'streams_live_and_scheduled.html');

    const result = await checkChannelLiveStatus(handle, { customLogger: LOGGER_STUB });

    assert.equal(result.channelId, channelId);
    assert.equal(result.channelName, 'Firstpost');
    assert.equal(result.isLive, true);
    assert.equal(result.streams.live.length, 6);
    assert.equal(result.streams.scheduled.length, 1);
    assert.ok(!Number.isNaN(Date.parse(result.checkedAt)));
    assert.equal(result.videoId, 'A6-QQGWFQsg');
    assert.equal(result.streams.scheduled[0].videoId, 's8fnTMVKtxk');
});

test('checkChannelLiveStatus returns offline result when no streams', async() => {
    const handle = '@eons';
    const channelId = 'UCzR-rom72PHN9Zg7RML9EbA';

    mockHandle(handle, channelId);
    mockStreams(channelId, 'streams_none.html');

    const result = await checkChannelLiveStatus(handle, { customLogger: LOGGER_STUB });

    assert.equal(result.channelId, channelId);
    assert.equal(result.channelName, 'PBS Eons');
    assert.equal(result.isLive, false);
    assert.equal(result.streams.live.length, 0);
    assert.equal(result.streams.scheduled, null);
    assert.ok(!Number.isNaN(Date.parse(result.checkedAt)));
});
