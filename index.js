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
    const url = `https://www.youtube.com/channel/${channelId}/live`;
    const targetDescriptor = handle ? `${channelId} (from ${handle})` : channelId;
    pkgLogger.info(`Checking live status for channel: ${targetDescriptor} at ${url}`);

    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US' },
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400,
        });

        pkgLogger.debug('Request successful, parsing HTML...');
        fs.writeFileSync(LAST_RESPONSE_FILE, response.data, 'utf8');

        const $ = cheerio.load(response.data);
        let ytInitialData = null;

        $('script').each(function() {
            const htmlContent = String($(this).html() || '');
            if (htmlContent.includes('ytInitialData')) {
                const match = htmlContent.match(/ytInitialData\s*=\s*(\{.*?});/s);
                if (match && match[1]) {
                    ytInitialData = JSON.parse(match[1]);
                    pkgLogger.debug('ytInitialData parsed successfully.');
                    return false;
                }
            }
            return undefined;
        });

        if (!ytInitialData) {
            pkgLogger.warn('ytInitialData not found.');
            const fallbackResult = { isLive: false, channelId, channelName: 'Unknown Channel' };
            if (handle) {
                fallbackResult.channelHandle = handle;
            }
            return fallbackResult;
        }

        const { channelName, channelIdExtracted } = extractChannelInfo(ytInitialData, channelId);

        const twoColumnRoot = ytInitialData?.contents?.twoColumnWatchNextResults;
        const resultsContainer = twoColumnRoot?.results?.results ?? {};
        const resultItems = Array.isArray(resultsContainer.contents) ? resultsContainer.contents : [];
        const primaryInfo = resultItems[0]?.videoPrimaryInfoRenderer;
        if (primaryInfo) {
            const viewCountRenderer = primaryInfo.viewCount?.videoViewCountRenderer;
            if (viewCountRenderer?.isLive) {
                pkgLogger.info(`Channel ${channelId} is live!`);

                const title = primaryInfo.title?.runs?.[0]?.text || '';
                const viewCount = (viewCountRenderer.viewCount?.runs || [])
                    .map(run => run.text)
                    .join('')
                    .replace(' watching now', '')
                    .trim();

                const currentEndpoint = ytInitialData?.currentVideoEndpoint?.watchEndpoint;
                const videoId = currentEndpoint?.videoId;
                const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

                const liveResult = { isLive: true, videoId, title, viewCount, channelName, channelId: channelIdExtracted, videoUrl };
                if (handle) {
                    liveResult.channelHandle = handle;
                }
                return liveResult;
            }
        }

        pkgLogger.info(`Channel ${channelId} is not live at the moment.`);
        const offlineResult = { isLive: false, channelId: channelIdExtracted, channelName };
        if (handle) {
            offlineResult.channelHandle = handle;
        }
        return offlineResult;
    } catch (error) {
        pkgLogger.error(`Error checking live status: ${error.message}`);
        fs.writeFileSync(ERROR_RESPONSE_FILE, error.response?.data || '', 'utf8');
        throw error;
    }
}

// Helper function to extract channel information
function extractChannelInfo(ytInitialData, defaultChannelId) {
    let channelName = 'Unknown Channel';
    let channelIdExtracted = defaultChannelId;

    const twoColumnRoot = ytInitialData?.contents?.twoColumnWatchNextResults;
    const resultsContainer = twoColumnRoot?.results?.results ?? {};
    const resultItems = Array.isArray(resultsContainer.contents) ? resultsContainer.contents : [];
    const secondaryInfo = resultItems[1]?.videoSecondaryInfoRenderer;
    if (secondaryInfo) {
        channelName = secondaryInfo.owner?.videoOwnerRenderer?.title?.runs?.[0]?.text || channelName;
        channelIdExtracted = secondaryInfo.owner?.videoOwnerRenderer?.navigationEndpoint?.browseEndpoint?.browseId || channelIdExtracted;
    } else {
        const metadata = ytInitialData?.metadata?.channelMetadataRenderer;
        const microformat = ytInitialData?.microformat?.microformatDataRenderer;
        const responseContext = ytInitialData?.responseContext?.webResponseContextExtensionData?.ytConfigData;
        channelName = metadata?.title ||
            microformat?.ownerChannelName ||
            (responseContext?.canonicalBaseUrl || '').replace('/@', '') ||
            channelName;
    }

    return { channelName, channelIdExtracted };
}

// Export only the main function
exports.checkChannelLiveStatus = checkChannelLiveStatus;

// If run as a standalone script, take the identifier from CLI
if (require.main === module) {
    const channelIdentifier = process.argv[2];
    if (!channelIdentifier) {
        logger.error('Please provide a YouTube channel ID, handle, or channel URL.');
        process.exit(1);
    }

    checkChannelLiveStatus(channelIdentifier)
        .then(result => {
            logger.info(result.isLive ? 'The channel is live!' : 'The channel is not live currently.');
            logger.info(JSON.stringify(result, null, 2));
        })
        .catch(error => {
            logger.error(`Failed to check live status: ${error.message}`);
        });
}
