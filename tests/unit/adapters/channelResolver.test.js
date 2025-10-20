const test = require('node:test');
const assert = require('node:assert/strict');
const nock = require('nock');

const { resolveChannelIdentifier } = require('../../../src/adapters/channelResolver');

nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

test.after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
});

function mockHandleResponse(handle, html) {
    nock('https://www.youtube.com')
        .get(`/${handle}`)
        .reply(200, html);
}

function mockRedirectHandle(handle, channelId) {
    nock('https://www.youtube.com')
        .get(`/${handle}`)
        .reply(303, undefined, {
            Location: `https://www.youtube.com/channel/${channelId}`,
        });
}

function mockChannelPage(channelId) {
    const html = `<html><head><meta itemprop="identifier" content="${channelId}"></head></html>`;
    nock('https://www.youtube.com')
        .get(`/channel/${channelId}`)
        .reply(200, html);
}

test('resolveChannelIdentifier returns canonical ID when provided an ID', async () => {
    const id = 'UC1234567890ABCDEFGHIJ';
    const result = await resolveChannelIdentifier(id);
    assert.deepEqual(result, { channelId: id, handle: null });
});

test('resolveChannelIdentifier resolves simple handle', async () => {
    const channelId = 'UCabcdefabcdefabcdefabcd';
    mockHandleResponse('@example', `<html><head><meta itemprop="identifier" content="${channelId}"></head></html>`);

    const result = await resolveChannelIdentifier('@example');
    assert.equal(result.channelId, channelId);
    assert.equal(result.handle, '@example');

    nock.cleanAll();
});

test('resolveChannelIdentifier follows redirects for handles', async () => {
    const channelId = 'UCredirectredirectredirect12';
    mockRedirectHandle('@redirect', channelId);
    mockChannelPage(channelId);

    const result = await resolveChannelIdentifier('@redirect');
    assert.equal(result.channelId, channelId);
    assert.equal(result.handle, '@redirect');

    nock.cleanAll();
});
