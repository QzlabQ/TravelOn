import {defineConfig, devices} from '@playwright/test';
import path from 'path';

const baseURL = process.env.TRAVEL_UI_URL ?? 'http://127.0.0.1:53000';
const reportRoot = process.env.PLAYWRIGHT_REPORT_DIR
    ?? path.resolve(__dirname, '../artifacts/test-results/e2e');

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    outputDir: path.join(reportRoot, 'attachments'),
    reporter: [
        ['list'],
        ['html', {outputFolder: path.join(reportRoot, 'html'), open: 'never'}],
        ['junit', {outputFile: path.join(reportRoot, 'junit.xml')}],
    ],
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {name: 'chromium', use: {...devices['Desktop Chrome']}},
        {name: 'firefox', use: {...devices['Desktop Firefox']}},
        {name: 'webkit', use: {...devices['Desktop Safari']}},
    ],
    webServer: {
        command: 'corepack yarn build && corepack yarn serve',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 300_000,
    },
});
