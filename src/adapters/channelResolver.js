const axios = require('axios');
const cheerio = require('cheerio');
const { USER_AGENT, CHANNEL_ID_REGEX } = require('../config/constants');

function extractHandleFromIdentifier(identifier) {
    if (typeof identifier !== 'string') {
        return null;
    }

    const trimmed = identifier.trim();
    if (!trimmed) {
        return null;
    }

    if (CHANNEL_ID_REGEX.test(trimmed)) {
        return null;
    }

    try {
        const parsedUrl = new URL(trimmed);
        const segments = parsedUrl.pathname.split('/').filter(Boolean);
        const handleSegment = segments.find(segment => segment.startsWith('@'));
        if (handleSegment) {
            return `@${handleSegment.replace(/^@/, '')}`;
        }

        if (segments.length >= 2 && segments[0] === 'channel' && CHANNEL_ID_REGEX.test(segments[1])) {
            return null;
        }
    } catch {
        // Not a URL, fall through to string-based parsing.
    }

    if (trimmed.startsWith('@')) {
        return trimmed.split('/')[0];
    }

    if (/^[A-Za-z0-9._-]+$/.test(trimmed)) {
        return `@${trimmed.split('/')[0]}`;
    }

    return null;
}

async function resolveChannelIdentifier(identifier, pkgLogger) {
    if (typeof identifier !== 'string' || !identifier.trim()) {
        throw new Error('Channel identifier is required.');
    }

    const trimmed = identifier.trim();

    if (CHANNEL_ID_REGEX.test(trimmed)) {
        return { channelId: trimmed, handle: null };
    }

    try {
        const urlCandidate = new URL(trimmed);
        const segments = urlCandidate.pathname.split('/').filter(Boolean);
        if (segments.length >= 2 && segments[0] === 'channel' && CHANNEL_ID_REGEX.test(segments[1])) {
            return { channelId: segments[1], handle: null };
        }
    } catch {
        // Not a valid URL; continue to handle resolution.
    }

    let handle = extractHandleFromIdentifier(trimmed);
    if (!handle) {
        throw new Error(`Unable to interpret channel identifier "${identifier}". Provide a channel ID or handle.`);
    }

    if (!handle.startsWith('@')) {
        handle = `@${handle}`;
    }
    handle = handle.split('/')[0];

    const initialUrl = `https://www.youtube.com/${handle}`;
    pkgLogger?.debug?.(`Resolving handle ${handle} via ${initialUrl}`);

    const requestConfig = {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US' },
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400,
    };

    let response;
    let currentUrl = initialUrl;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            response = await axios.get(currentUrl, requestConfig);
        } catch (error) {
            const reason = error.response ? `HTTP ${error.response.status}` : error.message;
            throw new Error(`Failed to resolve handle ${handle}: ${reason}`);
        }

        const isRedirect = response.status >= 300 && response.status < 400;
        const redirectLocation = response.headers?.location;
        const hasContent = typeof response.data === 'string' && response.data.trim().length > 0;

        if (isRedirect && redirectLocation) {
            const nextUrl = new URL(redirectLocation, currentUrl).toString();
            pkgLogger?.debug?.(`Handle ${handle} redirected to ${nextUrl}`);
            currentUrl = nextUrl;
            continue;
        }

        if (hasContent) {
            break;
        }
    }

    if (!response || typeof response.data !== 'string' || response.data.trim().length === 0) {
        throw new Error(`Failed to resolve handle ${handle}: Empty response from ${currentUrl}`);
    }

    const $ = cheerio.load(response.data);
    let channelId = $('meta[itemprop="identifier"]').attr('content') ||
        $('meta[itemprop="channelId"]').attr('content');

    if (!channelId) {
        const match = response.data.match(/"browseId":"(UC[\w-]{20,})"/);
        if (match) {
            [, channelId] = match;
        }
    }

    if (!channelId || !CHANNEL_ID_REGEX.test(channelId)) {
        throw new Error(`Unable to resolve channel ID from handle ${handle}.`);
    }

    return { channelId, handle };
}

module.exports = {
    extractHandleFromIdentifier,
    resolveChannelIdentifier,
};
