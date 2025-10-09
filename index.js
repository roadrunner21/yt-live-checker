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
 * Check if a YouTube channel is live
 * @param {string} channelId - The YouTube channel ID.
 * @param {Object} [options] - Options for the function.
 * @param {Object} [options.customLogger] - Optional custom logger provided by the host application.
 * @param {boolean} [options.enableLogging] - Enable logging when used as a dependency.
 * @returns {Promise<Object>} - Object containing live status and channel info.
 */
async function checkChannelLiveStatus(channelId, options = {}) {
    const pkgLogger = initializeLogger(options);
    const url = `https://www.youtube.com/channel/${channelId}/live`;
    pkgLogger.info(`Checking live status for channel: ${channelId} at ${url}`);

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
            return { isLive: false, channelId, channelName: 'Unknown Channel' };
        }

        const { channelName, channelIdExtracted } = extractChannelInfo(ytInitialData, channelId);

        const primaryInfo = ytInitialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[0]?.videoPrimaryInfoRenderer;

        /** @type YouTubeLiveInfo */
        let result = null;
        
        if (primaryInfo) {
            const viewCountRenderer = primaryInfo.viewCount?.videoViewCountRenderer;
            if (viewCountRenderer?.isLive) {
                let isLive = true;
                pkgLogger.info(`Channel ${channelId} is live!`);

                const title = primaryInfo.title?.runs?.[0]?.text || '';
                /** @type String */
                const viewCount = (viewCountRenderer.viewCount?.runs || [])
                    .map(run => run.text)
                    .join('')
                    .replace(' watching now', '')
                    .trim();

                if (viewCount?.includes(' waiting')) {
                    isLive = false;
                } else {
                    pkgLogger.info(`Channel ${channelId} is live!`);
                }

                result.title

                const videoId = ytInitialData?.currentVideoEndpoint?.watchEndpoint?.videoId;
                const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

                result = {
                    isLive: isLive,
                    videoId: isLive ? videoId : null,
                    title: isLive ? title : null,
                    viewCount,
                    channelName,
                    channelId: channelIdExtracted,
                    videoUrl: isLive ? videoUrl : null
                };
            }
        }

      if (result?.isLive) {
         // do nothing else
      } else {
         pkgLogger.info(`Channel ${channelId} is not live at the moment.`);
         result = result ?? {
            isLive: false,
            videoId: null,
            title: null,
            viewCount: null,
            channelName,
            channelId: channelIdExtracted,
            videoUrl: null
         };
      }

      return result;
    } catch (error) {
        pkgLogger.error(`Error checking live status: ${error.message}`);
        fs.writeFileSync(ERROR_RESPONSE_FILE, error.response?.data || '', 'utf8');
        throw error;
    }
}

/**
 * Extracts YouTube channel information from scraped data.
 * @param {object} [ytInitialData] - The raw YouTube page data object.
 * @param {string} [defaultChannelId] - A fallback channel ID if none is found in the data.
 * @returns {{ channelName: string, channelIdExtracted: string }} - The extracted channel name and ID.
 */
function extractChannelInfo(ytInitialData, defaultChannelId) {
    let channelName = 'Unknown Channel';
    let channelIdExtracted = defaultChannelId;

    const secondaryInfo = ytInitialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[1]?.videoSecondaryInfoRenderer;
    if (secondaryInfo) {
        channelName = secondaryInfo.owner?.videoOwnerRenderer?.title?.runs?.[0]?.text || channelName;
        channelIdExtracted = secondaryInfo.owner?.videoOwnerRenderer?.navigationEndpoint?.browseEndpoint?.browseId || channelIdExtracted;
    } else {
        channelName = ytInitialData?.metadata?.channelMetadataRenderer?.title ||
            ytInitialData?.microformat?.microformatDataRenderer?.ownerChannelName ||
            (ytInitialData?.responseContext?.webResponseContextExtensionData?.ytConfigData?.canonicalBaseUrl || '').replace('/@', '') ||
            channelName;
    }

    return { channelName, channelIdExtracted };
}

// Export only the main function
exports.checkChannelLiveStatus = checkChannelLiveStatus;

// If run as a standalone script, take the channel ID from CLI
if (require.main === module) {
    const channelId = process.argv[2];
    if (!channelId) {
        logger.error('Please provide a YouTube channel ID.');
        process.exit(1);
    }

    checkChannelLiveStatus(channelId)
        .then(result => {
            logger.info(result.isLive ? 'The channel is live!' : 'The channel is not live currently.');
            logger.info(JSON.stringify(result, null, 2));
        })
        .catch(error => {
            logger.error(`Failed to check live status: ${error.message}`);
        });
}
