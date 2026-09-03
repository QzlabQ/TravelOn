import {expect, test} from '@playwright/test';
import {registerThroughUi, uniqueAccount} from './support/auth';

/** BS-08 AI 行程规划与版本管理。 */
test('AI 规划可以创建会话并进入带版本控制的工作台', async ({page}) => {
    test.setTimeout(180_000);
    await registerThroughUi(page, uniqueAccount('planner'));

    await page.goto('/ai-planner');
    await expect(page.getByRole('heading', {name: '出行基础信息'})).toBeVisible();

    // 表单带演示默认值；清空必填城市后验证禁用状态。
    const startButton = page.getByRole('button', {name: '开始规划'});
    await page.getByLabel('旅游城市').fill('');
    await expect(startButton).toBeDisabled();

    await page.getByLabel('旅游城市').fill('上海');
    // MUI DatePicker 的输入格式由 locale 决定，直接 fill ISO 会把日期
    // 变成 invalid Dayjs。此用例保留页面自带的有效日期，只改业务字段。
    await page.getByLabel('人数').fill('2');

    await expect(startButton).toBeEnabled();
    await startButton.click();

    // 创建会话是一次普通的后端写入，与模型是否可用无关。
    await expect(page.getByRole('button', {name: '开始规划'})).toHaveCount(0, {timeout: 60_000});

    // 只断言工作台骨架：Markdown 面板、版本选择器、转发入口在会话建好后必然渲染，
    // 与模型是否产出日计划无关。
    //
    // 这里不能断言「第 1 天」这类日计划元素：它要等 planner 真的跑出日计划才出现，
    // 外部模型不可用时不会有，用例就会随模型可用性时红时绿。
    await expect(page.getByText('规划 Markdown')).toBeVisible({timeout: 60_000});
    await expect(page.getByRole('combobox', {name: '历史版本'})).toBeVisible({timeout: 60_000});
    await expect(page.getByRole('button', {name: '转发社区'})).toBeVisible();
});

test('未填必填项时规划表单给出明确提示', async ({page}) => {
    await registerThroughUi(page, uniqueAccount('planner-validation'));
    await page.goto('/ai-planner');

    await page.getByLabel('出发城市').fill('北京');
    await page.getByLabel('旅游城市').fill('');
    // 只保留非必填的出发城市，按钮应保持禁用。
    await expect(page.getByRole('button', {name: '开始规划'})).toBeDisabled();
    await expect(page.getByText('城市、日期、人数是必填项，其它信息会作为 AI 生成规划的偏好约束。')).toBeVisible();
});

test.describe('桩模型下的确定性规划与版本闭环', () => {
    test.skip(
        !process.env.TRAVEL_TEST_LLM_STUB,
        '需要桩模型端点：用 python tests/run_tests.py e2e --manage-services 运行',
    );

    async function startStubPlan(page: Parameters<typeof registerThroughUi>[0], accountPrefix: string) {
        await registerThroughUi(page, uniqueAccount(accountPrefix));
        await page.goto('/ai-planner');
        await page.getByLabel('旅游城市').fill('上海');
        // MUI DatePicker 使用 locale 格式；保留页面自带的有效默认日期。
        await page.getByLabel('人数').fill('2');
        await page.getByRole('button', {name: '开始规划'}).click();
        await expect(page.getByRole('button', {name: '开始规划'})).toHaveCount(0, {timeout: 60_000});
    }

    test('生成行程使用桩响应并产出第 1 天计划', async ({page}) => {
        test.setTimeout(180_000);
        await startStubPlan(page, 'planner-stub-generate');

        const markdownPanel = page.locator('section').filter({
            has: page.getByText('规划 Markdown', {exact: true}),
        });
        await expect(markdownPanel.getByText('桩模型示例行程', {exact: true})).toBeVisible({timeout: 120_000});
        await expect(markdownPanel.getByText('这是由 E2E 桩模型返回的固定规划')).toBeVisible();
        await expect(page.getByText('第 1 天 · 桩模型示例行程', {exact: false})).toBeVisible();
        await expect(page.getByText('日计划待生成')).toHaveCount(0);
    });

    test('Markdown 新版本可以回看旧版本并回到最新', async ({page}) => {
        test.setTimeout(180_000);
        await startStubPlan(page, 'planner-stub-version');

        const historySelector = page.getByRole('combobox', {name: '历史版本'});
        await expect(historySelector).toBeVisible();
        await expect(page.getByText('暂无历史版本')).toBeVisible();
        const markdownPanel = page.locator('section').filter({
            has: page.getByText('规划 Markdown', {exact: true}),
        });
        await expect(markdownPanel.getByText('桩模型示例行程', {exact: true})).toBeVisible({timeout: 120_000});
        await expect(page.getByText('1 个历史版本')).toBeVisible();

        const editedMarkdown = '# E2E 手工版本\n\n这是手工编辑后的确定内容。';
        await page.getByRole('button', {name: '编辑'}).click();
        await page.getByPlaceholder('AI 生成的 Markdown 规划会显示在这里。').fill(editedMarkdown);
        await page.getByRole('button', {name: '保存为新版本'}).click();

        await expect(markdownPanel.getByText('E2E 手工版本', {exact: true})).toBeVisible({timeout: 60_000});
        await expect(page.getByText('2 个历史版本')).toBeVisible({timeout: 60_000});

        await historySelector.click();
        const versionOptions = page.getByRole('option').filter({hasText: /^v\d+/});
        await expect(versionOptions).toHaveCount(2);
        await page.getByRole('option', {name: /^v1\b/}).click();

        await expect(page.getByText('正在只读回看', {exact: false})).toBeVisible();
        await expect(markdownPanel.getByText('桩模型示例行程', {exact: true})).toBeVisible();
        await expect(page.getByText('这是手工编辑后的确定内容。')).toHaveCount(0);

        await page.getByRole('button', {name: '回到最新'}).click();
        await expect(page.getByText('正在只读回看', {exact: false})).toHaveCount(0);
        await expect(markdownPanel.getByText('E2E 手工版本', {exact: true})).toBeVisible();
        await expect(page.getByText('这是手工编辑后的确定内容。')).toBeVisible();
    });
});
