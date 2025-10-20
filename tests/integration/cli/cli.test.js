const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const path = require('path');

function execCli(args, scenario) {
    const cliPath = path.join(__dirname, '..', '..', '..', 'src', 'cli', 'index.js');
    const env = {
        ...process.env,
        NODE_OPTIONS: `--require=${path.join(__dirname, '..', '..', 'helpers', 'setupNock.js')}`,
        NOCK_SCENARIO: scenario,
        NODE_ENV: 'production',
    };

    return new Promise((resolve, reject) => {
        execFile(process.execPath, [cliPath, ...args], { env }, (error, stdout, stderr) => {
            if (error) {
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

function extractJson(stdout) {
    const startIndex = stdout.indexOf('{');
    const endIndex = stdout.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error(`No JSON object found in stdout:\n${stdout}`);
    }
    const jsonString = stdout.slice(startIndex, endIndex + 1);
    return JSON.parse(jsonString);
}

test('CLI outputs JSON for live channel', async () => {
    const { stdout } = await execCli(['@TheSilentWatcher'], 'single_live');
    const result = extractJson(stdout);

    assert.equal(result.channelName, 'TheSilentWatcher');
    assert.equal(result.isLive, true);
    assert.equal(result.streams.live.length, 1);
    assert.equal(result.streams.scheduled, null);
});

test('CLI handles offline channel', async () => {
    const { stdout } = await execCli(['@eons'], 'none');
    const result = extractJson(stdout);

    assert.equal(result.channelName, 'PBS Eons');
    assert.equal(result.isLive, false);
    assert.deepEqual(result.streams, { live: [], scheduled: null });
});
