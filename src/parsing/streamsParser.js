const cheerio = require('cheerio');
const { parseViewerCount } = require('./viewerCount');

function collectVideoRenderers(root) {
    const results = [];
    const stack = Array.isArray(root) ? [...root] : [root];

    while (stack.length) {
        const current = stack.pop();
        if (!current) {
            continue;
        }

        if (Array.isArray(current)) {
            stack.push(...current);
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

    const viewerCount = parseViewerCount(viewCountText || overlayText);

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
        if (typeof entry.viewerCount === 'number') {
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

module.exports = {
    parseStreamsPage,
};
