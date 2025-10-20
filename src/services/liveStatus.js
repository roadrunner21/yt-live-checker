const fs = require('fs');
const { resolveChannelIdentifier } = require('../adapters/channelResolver');
const { fetchYouTubePage } = require('../adapters/youtubeFetcher');
const { parseStreamsPage } = require('../parsing/streamsParser');
const { initializeLogger } = require('../utils/logger');
const { LAST_RESPONSE_FILE, ERROR_RESPONSE_FILE } = require('../config/constants');

async function checkChannelLiveStatus(channelIdentifier, options = {}) {
    const {
        saveHtml = false,
        customLogger,
        ...loggerOptions
    } = options;

    const pkgLogger = customLogger || initializeLogger(loggerOptions);
    const { channelId, handle } = await resolveChannelIdentifier(channelIdentifier, pkgLogger);
    const streamsUrl = `https://www.youtube.com/channel/${channelId}/streams`;
    const targetDescriptor = handle ? `${channelId} (from ${handle})` : channelId;
    pkgLogger.info(`Checking live status for channel: ${targetDescriptor} at ${streamsUrl}`);

    try {
        const html = await fetchYouTubePage(streamsUrl, pkgLogger);
        pkgLogger.debug('Streams page fetched successfully, parsing content...');

        if (saveHtml) {
            fs.writeFileSync(LAST_RESPONSE_FILE, html, 'utf8');
        }

        const { channelName, channelId: canonicalChannelId, liveStreams, scheduledStreams } =
            parseStreamsPage(html, pkgLogger);
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
        if (saveHtml && error.response?.data) {
            fs.writeFileSync(ERROR_RESPONSE_FILE, error.response.data, 'utf8');
        }
        throw error;
    }
}

module.exports = {
    checkChannelLiveStatus,
};
