
# yt-live-checker

A Node.js tool to check if a YouTube channel is currently live streaming.

## Table of Contents
- [Installation](#installation)
- [Usage](#usage)
   - [As a Standalone Tool](#as-a-standalone-tool)
   - [As a Dependency](#as-a-dependency)
- [Example](#example)
- [Dependencies](#dependencies)
- [License](#license)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/yt-live-checker.git
   ```

2. Navigate to the project directory:
   ```bash
   cd yt-live-checker
   ```

3. Install the dependencies:
   ```bash
   npm install
   ```

## Usage

### As a Standalone Tool

To use `yt-live-checker` as a standalone CLI tool, run the following command (from the project root) with a YouTube channel ID, handle (with or without `@`), or channel URL:

```bash
node src/index.js <channelIdentifier>
```

Examples:
```bash
node src/cli/index.js UCCAfRoTJrKPbSrh_Eg3i4vg
node src/cli/index.js @BusinessInsider
node src/cli/index.js https://www.youtube.com/@BusinessInsider/streams
node src/cli/index.js --streams @IndiaToday       # also list all live/scheduled streams in the console output
node src/cli/index.js --streams-json @IndiaToday  # pretty-print just the streams object
node src/cli/index.js --save-html @IndiaToday     # persist the fetched HTML response for debugging
```

Add the optional `--streams` (or `-s`) flag to print a human-readable list of every live and scheduled broadcast before the JSON payload. Use `--streams-json` (or `-j`) to emit just the `streams` object to stdout, and `--save-html` to persist the latest response in `last_response.html` / `error_response.html` for debugging. Requests are forced to `Accept-Language: en-US`, so the tool currently assumes English overlay text when parsing counts.

For convenience, the following npm scripts wrap the CLI:

```bash
npm run check -- <channelIdentifier>
npm run check:streams -- <channelIdentifier>
npm run check:streams-json -- <channelIdentifier>
npm run check:save-html -- <channelIdentifier>
```

### As a Dependency

To use `yt-live-checker` in your project, first install it via npm:

```bash
npm install yt-live-checker
```

Then, import and use it in your code:

```javascript
const { checkChannelLiveStatus } = require('yt-live-checker');

// Optional: Use your own logger
const winston = require('winston');
const customLogger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});

checkChannelLiveStatus('@BusinessInsider', { customLogger })
    .then(result => {
        console.log(result);
    })
    .catch(error => {
        console.error(error);
    });
```

If you don't provide a custom logger, `yt-live-checker` will use its default logging configuration based on the `NODE_ENV` environment variable.

Whenever multiple streams are in progress or scheduled, the returned object includes a `streams` property with `live` and `scheduled` collections (the scheduled list is `null` when there are no upcoming events) so you can inspect every event, while the top-level fields continue to describe the primary live stream for backwards compatibility. Each entry provides `viewerCount` as a number (when YouTube exposes “NN watching/waiting”), alongside the original text.

## Example Output

When a channel is live, the top-level fields mirror previous behaviour (describing the primary stream) and a `streams` section lists every live or scheduled event:

```json
{
  "isLive": true,
  "videoId": "mf2fCLtUUVA",
  "title": "Drama Stream",
  "viewCount": "243,989 watching",
  "channelName": "TomDark",
  "channelId": "UCCAfRoTJrKPbSrh_Eg3i4vg",
  "videoUrl": "https://www.youtube.com/watch?v=mf2fCLtUUVA",
  "checkedAt": "2025-10-20T18:40:00.000Z",
  "streams": {
    "live": [
      {
        "videoId": "mf2fCLtUUVA",
        "title": "Drama Stream",
        "viewCountText": "243,989 watching",
        "watchUrl": "https://www.youtube.com/watch?v=mf2fCLtUUVA",
        "viewerCount": 243989
      },
      {
        "videoId": "abc123",
        "title": "Bonus Commentary",
        "viewCountText": "17,201 watching",
        "watchUrl": "https://www.youtube.com/watch?v=abc123",
        "viewerCount": 17201
      }
    ],
    "scheduled": null
  }
}
```

When no streams are live, `isLive` is false and you still receive any scheduled events:

```json
{
  "isLive": false,
  "channelId": "UCCAfRoTJrKPbSrh_Eg3i4vg",
  "channelName": "TomDark",
  "checkedAt": "2025-10-20T18:40:00.000Z",
  "streams": {
    "live": [],
    "scheduled": [
      {
        "videoId": "sched001",
        "title": "Tomorrow's Big Premiere",
        "viewCountText": "Scheduled for Oct 21, 2025",
        "watchUrl": "https://www.youtube.com/watch?v=sched001",
        "viewerCount": null,
        "scheduledStartTime": 1761016800
      }
    ]
  }
}
```

> **Stream ordering:** The `streams.live` array keeps YouTube’s native ordering for the channel’s streams. The first entry is whichever broadcast YouTube features on the `/streams` page, and the top-level `videoId/title/viewCount` reflect that same primary item. The `checkedAt` timestamp indicates when the lookup was performed.

## Dependencies

This project relies on the following Node.js packages:
- `axios` for making HTTP requests
- `cheerio` for parsing HTML
- `jsonpath-plus` for querying JSON data
- `winston` for logging

## License

This project is licensed under the [Prosperity Public License](./LICENSE). You are free to use this software non-commercially. For commercial use, please contact the author for permission or refer to the terms in the license.
