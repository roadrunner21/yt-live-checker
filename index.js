// Import required modules
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Constants and Configuration
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const LOG_FILE = path.join(__dirname, 'channel_live_check.log');
const LAST_RESPONSE_FILE = path.join(__dirname, 'last_response.html');
const ERROR_RESPONSE_FILE = path.join(__dirname, 'error_response.html');

// Helper function to log messages
function logMessage(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, logEntry, 'utf8');
    console.log(logEntry.trim());
}

// Main function to check if a YouTube channel is live
async function checkChannelLiveStatus(channelId) {
    const url = `https://www.youtube.com/channel/${channelId}/live`;
    logMessage(`Checking live status for channel: ${channelId} at ${url}`);

    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US' },
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400,
        });

        logMessage('Request successful, parsing HTML...');
        fs.writeFileSync(LAST_RESPONSE_FILE, response.data, 'utf8');

        const $ = cheerio.load(response.data);
        let ytInitialData = null;

        $('script').each((_, script) => {
            const htmlContent = $(script).html();
            if (htmlContent && htmlContent.includes('ytInitialData')) {
                const match = htmlContent.match(/ytInitialData\s*=\s*(\{.*?});/s);
                if (match && match[1]) {
                    ytInitialData = JSON.parse(match[1]);
                    logMessage('ytInitialData parsed successfully.');
                    return false; // Stop after finding ytInitialData
                }
            }
        });

        if (!ytInitialData) {
            logMessage('ytInitialData not found.');
            return { isLive: false, channelId, channelName: 'Unknown Channel' };
        }

        const { channelIdExtracted, channelName } = extractChannelInfo(ytInitialData, channelId);

        const primaryInfo = ytInitialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[0]?.videoPrimaryInfoRenderer;
        if (primaryInfo) {
            const viewCountRenderer = primaryInfo.viewCount?.videoViewCountRenderer;
            if (viewCountRenderer?.isLive) {
                logMessage(`Channel ${channelId} is live!`);

                const title = primaryInfo.title?.runs?.[0]?.text || '';
                const viewCount = (viewCountRenderer.viewCount?.runs || [])
                    .map(run => run.text)
                    .join('')
                    .replace(' watching now', '')
                    .trim();

                const videoId = ytInitialData?.currentVideoEndpoint?.watchEndpoint?.videoId;
                const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

                return { isLive: true, videoId, title, viewCount, channelName, channelId: channelIdExtracted, videoUrl };
            }
        }

        logMessage(`Channel ${channelId} is not live at the moment.`);
        return { isLive: false, channelId: channelIdExtracted, channelName };
    } catch (error) {
        logMessage(`Error checking live status: ${error.message}`);
        fs.writeFileSync(ERROR_RESPONSE_FILE, error.response?.data || '', 'utf8');
        throw error;
    }
}

// Helper function to extract channel information
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

module.exports = { checkChannelLiveStatus };

// Usage example
if (require.main === module) {
    const channelId = process.argv[2];
    if (!channelId) {
        console.error('Please provide a YouTube channel ID.');
        process.exit(1);
    }

    checkChannelLiveStatus(channelId)
        .then(result => {
            console.log(result.isLive ? `The channel is live!` : 'The channel is not live currently.');
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(error => {
            console.error('Failed to check live status:', error.message);
        });
}
