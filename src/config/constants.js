const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const LOG_FILE = path.join(ROOT_DIR, 'channel_live_check.log');
const LAST_RESPONSE_FILE = path.join(ROOT_DIR, 'last_response.html');
const ERROR_RESPONSE_FILE = path.join(ROOT_DIR, 'error_response.html');
const CHANNEL_ID_REGEX = /^UC[\w-]{20,}$/;

module.exports = {
    ROOT_DIR,
    USER_AGENT,
    LOG_FILE,
    LAST_RESPONSE_FILE,
    ERROR_RESPONSE_FILE,
    CHANNEL_ID_REGEX,
};
