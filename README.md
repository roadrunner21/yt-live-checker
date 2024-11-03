# yt-live-checker

A Node.js tool to check if a YouTube channel is currently live streaming.

## Table of Contents
- [Installation](#installation)
- [Usage](#usage)
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

To use `yt-live-checker`, run the following command with the YouTube channel ID as an argument:

```bash
node index.js <channelId>
```

Replace `<channelId>` with the ID of the YouTube channel you want to check.

Example:
```bash
node index.js UCCAfRoTJrKPbSrh_Eg3i4vg
```

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

## License

This project is licensed under the ISC License.
# yt-live-checker
