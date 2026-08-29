import {defineConfig, devices} from '@playwright/test';
import path from 'path';

const baseURL = process.env.TRAVEL_UI_URL ?? 'http://127.0.0.1:53000';
const reportRoot = process.env.PLAYWRIGHT_REPORT_DIR
    ?? path.resolve(__dirname, '../artifacts/test-results/e2e');

export default defineConfig({
    testDir: './tests/e2e',
    // 用例并行跑在同一套本地服务栈上，相互抢占资源：单独执行约 8 秒的查询用例，
    // 5 个 worker 并行时会涨到近 30 秒，恰好卡在 Playwright 默认的用例超时上，
    // 服务刚启动（缓存冷、连接池未预热）时更会直接超时。统一放宽到 90 秒。
    timeout: 90_000,
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
