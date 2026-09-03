import {expect, test} from '@playwright/test';
import {registerThroughUi, uniqueAccount} from './support/auth';

/**
 * BS-08 AI 行程规划与版本管理。此前 /ai-planner 页面零 E2E 覆盖。
 *
 * 刻意不断言模型生成的内容：外部模型不可用时规划会走降级路径，断言正文会让这条用例
 * 变成 CI 里最大的 flaky 来源。这里只验证结构性结果——会话能创建、规划工作台能进入、
 * 快照与版本控件真实存在。
 */
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
