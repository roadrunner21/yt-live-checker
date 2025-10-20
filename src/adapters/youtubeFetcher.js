const axios = require('axios');
const { USER_AGENT } = require('../config/constants');

async function fetchYouTubePage(url, pkgLogger) {
    pkgLogger?.debug?.(`Fetching URL: ${url}`);
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US' },
            maxRedirects: 5,
            validateStatus: status => status >= 200 && status < 400,
        });
        if (typeof response.data !== 'string' || !response.data.trim()) {
            throw new Error(`Empty response body from ${url}`);
        }
        return response.data;
    } catch (error) {
        const reason = error.response ? `HTTP ${error.response.status}` : error.message;
        throw new Error(`Failed to fetch ${url}: ${reason}`);
    }
}

module.exports = {
    fetchYouTubePage,
};
