// index.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');

// Constants and Configuration
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const LOG_FILE = path.join(__dirname, 'channel_live_check.log');
const LAST_RESPONSE_FILE = path.join(__dirname, 'last_response.html');
const ERROR_RESPONSE_FILE = path.join(__dirname, 'error_response.html');
const CHANNEL_ID_REGEX = /^UC[\w-]{20,}$/;

/**
 * Attempt to extract a channel handle (e.g., @ExampleChannel) from user input.
 * @param {string} identifier - Raw identifier provided by the caller.
 * @returns {string|null} - Normalized handle starting with '@' or null if unavailable.
 */
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

/**
 * Resolve a YouTube channel identifier to a canonical channel ID.
 * Accepts channel IDs, handles, and channel URLs.
 * @param {string} identifier - Channel ID, handle, or URL.
 * @param {Object} pkgLogger - Logger instance for diagnostics.
 * @returns {Promise<{channelId: string, handle: string|null}>}
 */
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

        // If no content but no redirect info, break to error out.
        break;
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

/**
 * Fetch a YouTube page, following redirects when necessary.
 * @param {string} url - Fully-qualified URL to fetch.
 * @param {Object} pkgLogger - Logger for diagnostics.
 * @returns {Promise<string>} - Resolved HTML response.
 */
async function fetchYouTubePage(url, pkgLogger) {
    pkgLogger?.debug?.(`Fetching URL: ${url}`);
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US' },
            maxRedirects: 5,
            validateStatus: status => status >= 200 && status < 400,
        });
        if (typeof response.data !== 'string' || !response.data.trim()) {
            throw new Error(`Empty response body from ${url}`);
        }
        return response.data;
    } catch (error) {
        const reason = error.response ? `HTTP ${error.response.status}` : error.message;
        throw new Error(`Failed to fetch ${url}: ${reason}`);
    }
}

/**
 * Recursively collect video renderers from a streams tab payload.
 * @param {any} root - Streams tab section to traverse.
 * @returns {Array<Object>} - Array of video renderer objects.
 */
function collectVideoRenderers(root) {
    const results = [];
    const stack = Array.isArray(root) ? [...root] : [root];

    while (stack.length) {
        const current = stack.pop();
        if (!current) {
            continue;
        }

        if (Array.isArray(current)) {
            for (const item of current) {
                stack.push(item);
            }
            continue;
        }

        if (typeof current !== 'object') {
            continue;
        }

        if (current.videoRenderer) {
            results.push(current.videoRenderer);
        }

        if (current.gridVideoRenderer) {
            results.push(current.gridVideoRenderer);
        }

        for (const [key, value] of Object.entries(current)) {
            if (key === 'videoRenderer' || key === 'gridVideoRenderer') {
                continue;
            }
            if (value && (typeof value === 'object' || Array.isArray(value))) {
                stack.push(value);
            }
        }
    }

    return results;
}

/**
 * Normalize a video renderer into a stream descriptor and determine status.
 * @param {Object} renderer - Raw video renderer payload.
 * @returns {Object|null} - Normalized stream entry or null.
 */
function normalizeStreamEntry(renderer) {
    const videoId = renderer?.videoId;
    if (!videoId) {
        return null;
    }

    const title = renderer?.title?.simpleText ||
        (renderer?.title?.runs || []).map(run => run.text).join('') ||
        '';
    const badges = (renderer?.badges || [])
        .map(badge => badge?.metadataBadgeRenderer?.label)
        .filter(Boolean);

    const viewCountText = renderer?.viewCountText?.simpleText ||
        (renderer?.viewCountText?.runs || []).map(run => run.text).join('') ||
        '';

    const thumbnailOverlay = (renderer?.thumbnailOverlays || [])
        .map(overlay => overlay?.thumbnailOverlayTimeStatusRenderer)
        .filter(Boolean)[0] || null;

    const overlayStyle = thumbnailOverlay?.style || '';
    const overlayText = thumbnailOverlay?.text?.simpleText ||
        (thumbnailOverlay?.text?.runs || []).map(run => run.text).join('') ||
        '';

    const upcomingEvent = renderer?.upcomingEventData;
    const lowerViewText = (viewCountText || overlayText).toLowerCase();

    const isUpcoming = Boolean(upcomingEvent) ||
        overlayStyle === 'UPCOMING' ||
        lowerViewText.includes('scheduled') ||
        lowerViewText.includes('waiting');

    const isLive = !isUpcoming && (
        overlayStyle === 'LIVE' ||
        badges.map(label => label.toLowerCase()).includes('live') ||
        lowerViewText.includes('watching')
    );

    let viewerCount = null;
    const countMatch = (viewCountText || overlayText).match(/([\d,.]+)\s*(watching|waiting)/i);
    if (countMatch) {
        const numeric = Number(countMatch[1].replace(/,/g, ''));
        if (Number.isFinite(numeric)) {
            viewerCount = numeric;
        }
    }

    return {
        videoId,
        title,
        viewCountText,
        badges,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        isLive,
        isUpcoming,
        scheduledStartTime: upcomingEvent?.startTime ? Number(upcomingEvent.startTime) : undefined,
        viewerCount,
    };
}

/**
 * Parse the streams page HTML and classify live/upcoming videos.
 * @param {string} html - Raw HTML from the streams tab.
 * @param {Object} pkgLogger - Logger instance.
 * @returns {{channelName: string, channelId: string|null, liveStreams: Array<Object>, scheduledStreams: Array<Object>}}
 */
function parseStreamsPage(html, pkgLogger) {
    const $ = cheerio.load(html);
    let ytInitialData = null;

    $('script').each((_, el) => {
        if (ytInitialData) {
            return;
        }
        const content = $(el).html();
        if (!content) {
            return;
        }
        const match = content.match(/ytInitialData\s*=\s*(\{.*?});/s);
        if (match && match[1]) {
            ytInitialData = JSON.parse(match[1]);
        }
    });

    if (!ytInitialData) {
        throw new Error('ytInitialData not found on streams page.');
    }

    const metadata = ytInitialData?.metadata?.channelMetadataRenderer || {};
    const channelName = metadata.title || 'Unknown Channel';
    const canonicalChannelId = metadata.externalId || metadata.channelId || null;

    const tabs = ytInitialData?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    const streamsTab = tabs.find(tab => tab.tabRenderer?.selected) ||
        tabs.find(tab => (tab.tabRenderer?.title || '').toLowerCase() === 'live');

    const tabContent = streamsTab?.tabRenderer?.content || {};
    const richGridRenderer = tabContent.richGridRenderer;
    const sectionListRenderer = tabContent.sectionListRenderer;

    let videoRenderers = [];
    if (richGridRenderer) {
        videoRenderers = collectVideoRenderers(richGridRenderer.contents || []);
    } else if (sectionListRenderer) {
        videoRenderers = collectVideoRenderers(sectionListRenderer.contents || []);
    }

    const seen = new Set();
    const liveStreams = [];
    const scheduledStreams = [];

    for (const renderer of videoRenderers) {
        const entry = normalizeStreamEntry(renderer);
        if (!entry || !entry.videoId || seen.has(entry.videoId)) {
            continue;
        }

        seen.add(entry.videoId);

        const baseEntry = {
            videoId: entry.videoId,
            title: entry.title,
            viewCountText: entry.viewCountText,
            watchUrl: entry.watchUrl,
        };
        if (entry.viewerCount !== null) {
            baseEntry.viewerCount = entry.viewerCount;
        }
        if (entry.badges?.length) {
            baseEntry.badges = entry.badges;
        }
        if (entry.scheduledStartTime) {
            baseEntry.scheduledStartTime = entry.scheduledStartTime;
        }

        if (entry.isLive) {
            liveStreams.push(baseEntry);
        } else if (entry.isUpcoming) {
            scheduledStreams.push(baseEntry);
        } else {
            pkgLogger?.debug?.(`Ignoring non-live stream entry ${entry.videoId}`);
        }
    }

    return { channelName, channelId: canonicalChannelId, liveStreams, scheduledStreams };
}

/**
 * Initialize Logger
 * @param {Object} [options] - Options for initializing the logger.
 * @param {Object} [options.customLogger] - Optional custom logger provided by the host application.
 * @param {boolean} [options.enableLogging] - Enable logging when used as a dependency.
 * @returns {Object} - Configured logger instance.
 */
function initializeLogger(options = {}) {
    const { customLogger, enableLogging } = options;

    if (customLogger) {
        return customLogger;
    }

    const isDevelopment = process.env.NODE_ENV !== 'production';

    const loggerTransports = [];

    if (isDevelopment || enableLogging) {
        loggerTransports.push(new transports.Console());

        if (isDevelopment) {
            loggerTransports.push(new transports.File({ filename: LOG_FILE }));
        }
    }

    if (!isDevelopment && !enableLogging) {
        // Silent logger
        loggerTransports.push(new transports.Console({
            silent: true,
        }));
    } else if (!isDevelopment && enableLogging) {
        loggerTransports.push(new transports.Console({
            level: 'warn',
            format: format.combine(
                format.timestamp(),
                format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`),
            ),
        }));
    }

    return createLogger({
        level: isDevelopment || enableLogging ? 'debug' : 'info',
        format: format.combine(
            format.timestamp(),
            format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`),
        ),
        transports: loggerTransports,
    });
}

// Initialize logger with optional custom logger
const logger = initializeLogger();

/**
 * Check if a YouTube channel is live.
 * @param {string} channelIdentifier - Channel ID, handle, or URL.
 * @param {Object} [options] - Options for the function.
 * @param {Object} [options.customLogger] - Optional custom logger provided by the host application.
 * @param {boolean} [options.enableLogging] - Enable logging when used as a dependency.
 * @returns {Promise<Object>} - Object containing live status and channel info.
 */
async function checkChannelLiveStatus(channelIdentifier, options = {}) {
    const pkgLogger = initializeLogger(options);
    const { channelId, handle } = await resolveChannelIdentifier(channelIdentifier, pkgLogger);
    const streamsUrl = `https://www.youtube.com/channel/${channelId}/streams`;
    const targetDescriptor = handle ? `${channelId} (from ${handle})` : channelId;
    pkgLogger.info(`Checking live status for channel: ${targetDescriptor} at ${streamsUrl}`);

    try {
        const html = await fetchYouTubePage(streamsUrl, pkgLogger);
        pkgLogger.debug('Streams page fetched successfully, parsing content...');
        fs.writeFileSync(LAST_RESPONSE_FILE, html, 'utf8');

        const { channelName, channelId: canonicalChannelId, liveStreams, scheduledStreams } = parseStreamsPage(html, pkgLogger);
        const resolvedChannelId = canonicalChannelId || channelId;

        const result = {
            isLive: liveStreams.length > 0,
            channelId: resolvedChannelId,
            channelName,
            streams: {
                live: liveStreams,
                scheduled: scheduledStreams.length > 0 ? scheduledStreams : null,
            },
            checkedAt: new Date().toISOString(),
        };

        if (handle) {
            result.channelHandle = handle;
        }

        if (result.isLive) {
            const primaryStream = liveStreams[0];
            result.videoId = primaryStream.videoId;
            result.title = primaryStream.title;
            result.viewCount = primaryStream.viewCountText;
            result.videoUrl = primaryStream.watchUrl;

            pkgLogger.info(`Channel ${resolvedChannelId} is live with ${liveStreams.length} stream${liveStreams.length === 1 ? '' : 's'}.`);
        } else {
            pkgLogger.info(`Channel ${resolvedChannelId} is not live at the moment.`);
            if (scheduledStreams.length > 0) {
                pkgLogger.info(`Found ${scheduledStreams.length} upcoming stream${scheduledStreams.length === 1 ? '' : 's'}.`);
            }
        }

        return result;
    } catch (error) {
        pkgLogger.error(`Error checking live status: ${error.message}`);
        if (error.response?.data) {
            fs.writeFileSync(ERROR_RESPONSE_FILE, error.response.data, 'utf8');
        }
        throw error;
    }
}

// Export only the main function
exports.checkChannelLiveStatus = checkChannelLiveStatus;

// If run as a standalone script, take the identifier from CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const wantsStreamList = args.includes('--streams') || args.includes('-s');
    const channelIdentifier = args.find(arg => !arg.startsWith('-'));

    if (!channelIdentifier) {
        logger.error('Please provide a YouTube channel ID, handle, or channel URL.');
        process.exit(1);
    }

    checkChannelLiveStatus(channelIdentifier)
        .then(result => {
            logger.info(result.isLive ? 'The channel is live!' : 'The channel is not live currently.');

            if (wantsStreamList) {
                if (result.streams.live.length > 0) {
                    logger.info('Live streams:');
                    result.streams.live.forEach((stream, index) => {
                        const count = typeof stream.viewerCount === 'number' ? `${stream.viewerCount} viewers` : 'viewer count unavailable';
                        logger.info(`  ${index + 1}. ${stream.title} — ${count} — ${stream.watchUrl}`);
                    });
                } else {
                    logger.info('No live streams detected.');
                }

                if (result.streams.scheduled && result.streams.scheduled.length > 0) {
                    logger.info('Scheduled streams:');
                    result.streams.scheduled.forEach((stream, index) => {
                        const waitingText = typeof stream.viewerCount === 'number' ? `${stream.viewerCount} waiting` : 'waiting count unavailable';
                        const startTime = stream.scheduledStartTime ? new Date(stream.scheduledStartTime * 1000).toISOString() : 'start time unknown';
                        logger.info(`  ${index + 1}. ${stream.title} — ${waitingText} — starts at ${startTime} — ${stream.watchUrl}`);
                    });
                } else {
                    logger.info('No scheduled streams detected.');
                }
            }

            logger.info(JSON.stringify(result, null, 2));
        })
        .catch(error => {
            logger.error(`Failed to check live status: ${error.message}`);
        });
}
