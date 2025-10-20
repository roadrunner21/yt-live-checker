const path = require('path');
const fs = require('fs');
const nock = require('nock');

nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

const scenario = process.env.NOCK_SCENARIO;
if (!scenario) {
    nock.enableNetConnect();
    return;
}

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'streams');

const scenarios = {
    single_live: {
        handle: '@TheSilentWatcher',
        channelId: 'UCCkmgsl8W18oR6c_W7UZ1lQ',
        streamsFixture: 'streams_single_live.html',
    },
    multiple_live: {
        handle: '@NDTVProfitIndia',
        channelId: 'UC3uJIdRFTGgLWrUziaHbzrg',
        streamsFixture: 'streams_multiple_live.html',
    },
    live_and_scheduled: {
        handle: '@Firstpost',
        channelId: 'UCz8QaiQxApLq8sLNcszYyJw',
        streamsFixture: 'streams_live_and_scheduled.html',
    },
    none: {
        handle: '@eons',
        channelId: 'UCzR-rom72PHN9Zg7RML9EbA',
        streamsFixture: 'streams_none.html',
    },
};

const config = scenarios[scenario];
if (!config) {
    throw new Error(`Unknown NOCK_SCENARIO: ${scenario}`);
}

const handleHtml = `<html><head><meta itemprop="identifier" content="${config.channelId}"></head></html>`;

nock('https://www.youtube.com')
    .get(`/${config.handle}`)
    .reply(200, handleHtml);

const streamsHtml = fs.readFileSync(path.join(fixturesDir, config.streamsFixture), 'utf8');

nock('https://www.youtube.com')
    .get(`/channel/${config.channelId}/streams`)
    .reply(200, streamsHtml);

