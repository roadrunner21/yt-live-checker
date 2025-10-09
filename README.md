
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
   git clone https://github.com/roadrunner21/yt-live-checker.git
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

To use `yt-live-checker` as a standalone CLI tool, run the following command with the YouTube channel ID as an argument:

```bash
node index.js <channelId>
```

Replace `<channelId>` with the ID of the YouTube channel you want to check.

Example:
```bash
node index.js UCCAfRoTJrKPbSrh_Eg3i4vg
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

checkChannelLiveStatus('UCCAfRoTJrKPbSrh_Eg3i4vg', { logger: customLogger })
    .then(result => {
        console.log(result);
    })
    .catch(error => {
        console.error(error);
    });
```

If you don't provide a custom logger, `yt-live-checker` will use its default logging configuration based on the `NODE_ENV` environment variable.

## Example Output

When a channel is live, you’ll see output similar to:

```json
{
  "isLive": true,
  "videoId": "mf2fCLtUUVA",
  "title": "Bowblax: Criticism Not Welcome",
  "viewCount": "243989",
  "channelName": "TomDark",
  "channelId": "UCCAfRoTJrKPbSrh_Eg3i4vg",
  "videoUrl": "https://www.youtube.com/watch?v=mf2fCLtUUVA"
}
```

When a channel is not live, the output will be:

```json
{
  "isLive": false,
  "channelId": "UCCAfRoTJrKPbSrh_Eg3i4vg",
  "channelName": "TomDark"
}
```

## Dependencies

This project relies on the following Node.js packages:
- `axios` for making HTTP requests
- `cheerio` for parsing HTML
- `jsonpath-plus` for querying JSON data
- `winston` for logging

## License

This project is licensed under the [Prosperity Public License](./LICENSE). You are free to use this software non-commercially. For commercial use, please contact the author for permission or refer to the terms in the license.

