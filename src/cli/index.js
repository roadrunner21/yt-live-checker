#!/usr/bin/env node

const process = require('process');
const { checkChannelLiveStatus } = require('../services/liveStatus');

function handlePipeError(error) {
    if (error.code === 'EPIPE') {
        process.exit(0);
    }
    throw error;
}

process.stdout.on('error', handlePipeError);
process.stderr.on('error', handlePipeError);

function printUsage() {
    const cmd = 'node src/cli/index.js';
    // eslint-disable-next-line no-console
    console.log(`Usage: ${cmd} [options] <channelId|handle|url>

Options:
  -s, --streams         Print a human-readable list of live and scheduled streams
  -j, --streams-json    Output only the streams object as prettified JSON
      --save-html       Persist the fetched HTML response for debugging
  -h, --help            Show this help message
`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('-h') || args.includes('--help')) {
        printUsage();
        return;
    }

    const flags = new Set(args.filter(arg => arg.startsWith('-')));
    const positional = args.filter(arg => !arg.startsWith('-'));

    const channelIdentifier = positional[0];
    if (!channelIdentifier) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    const wantsStreamList = flags.has('-s') || flags.has('--streams');
    const wantsStreamsJson = flags.has('-j') || flags.has('--streams-json');
    const wantsSaveHtml = flags.has('--save-html');

    try {
        const result = await checkChannelLiveStatus(channelIdentifier, { saveHtml: wantsSaveHtml });

        if (wantsStreamList) {
            if (result.streams.live.length > 0) {
                // eslint-disable-next-line no-console
                console.log('Live streams:');
                result.streams.live.forEach((stream, index) => {
                    const count = typeof stream.viewerCount === 'number'
                        ? `${stream.viewerCount} viewers`
                        : 'viewer count unavailable';
                    // eslint-disable-next-line no-console
                    console.log(`  ${index + 1}. ${stream.title} — ${count} — ${stream.watchUrl}`);
                });
            } else {
                // eslint-disable-next-line no-console
                console.log('No live streams detected.');
            }

            if (result.streams.scheduled && result.streams.scheduled.length > 0) {
                // eslint-disable-next-line no-console
                console.log('Scheduled streams:');
                result.streams.scheduled.forEach((stream, index) => {
                    const waitingText = typeof stream.viewerCount === 'number'
                        ? `${stream.viewerCount} waiting`
                        : 'waiting count unavailable';
                    const startTime = stream.scheduledStartTime
                        ? new Date(stream.scheduledStartTime * 1000).toISOString()
                        : 'start time unknown';
                    // eslint-disable-next-line no-console
                    console.log(`  ${index + 1}. ${stream.title} — ${waitingText} — starts at ${startTime} — ${stream.watchUrl}`);
                });
            } else {
                // eslint-disable-next-line no-console
                console.log('No scheduled streams detected.');
            }
        }

        if (wantsStreamsJson) {
            process.stdout.write(`${JSON.stringify(result.streams, null, 2)}\n`);
        }

        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error.message || error);
        process.exitCode = 1;
    }
}

main();
