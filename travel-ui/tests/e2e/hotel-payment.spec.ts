import {expect, Page, test} from '@playwright/test';
import {registerThroughUi, uniqueAccount} from './support/auth';

function isoDate(offsetDays: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 退款以归还房间库存。
 *
 * 用例固定预订第一家酒店的第一间房，订单不退款就会把该房间在这段日期上永久占用，
 * 之后每次运行都会得到 hotelIsAvailable=false。因此清理必须在 finally 中执行：
 * 只在成功路径上退款的话，任何一次中途失败都会留下无法回收的房间。
 */
async function refundIfBooked(page: Page): Promise<void> {
    const match = page.url().match(/\/reservations\/([0-9a-f-]{36})/i);
    if (!match) return;
    try {
        await page.goto(`/reservations/${match[1]}`);
        const cancelButton = page.getByRole('button', {name: /申请退款|取消订单/});
        if (!(await cancelButton.isVisible().catch(() => false))) return;
        await cancelButton.click();
        const dialog = page.getByRole('dialog', {name: /申请退款|取消订单/});
        await dialog.getByLabel('原因').fill('端到端测试清理');
        await dialog.getByRole('button', {name: '确认提交'}).click();
        await expect(page.getByText(/已退款|已取消/).first()).toBeVisible({timeout: 30_000});
    } catch {
        // 清理失败不改变用例结论，让原始断言错误浮出来。
    }
}

test('酒店查询、下单、银联支付和订单状态形成完整闭环', async ({page}) => {
    // 本用例串起注册、下单、支付三段异步 saga，耗时波动大，放宽用例总超时。
    test.setTimeout(120_000);
    await registerThroughUi(page, uniqueAccount('hotel'));
    await page.goto('/reservations/hotels');

    await expect(page.getByRole('heading', {name: '酒店列表'})).toBeVisible();

    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill(isoDate(3));
    await dateInputs.nth(1).fill(isoDate(4));

    try {
        await page.getByRole('button', {name: '查询', exact: true}).click();
        const bookButton = page.getByRole('button', {name: '去预订'}).first();
        await expect(bookButton).toBeVisible();
        await bookButton.click();

        await page.getByRole('button', {name: '添加临时出行人'}).click();
        const travelerDialog = page.getByRole('dialog', {name: '添加临时出行人'});
        await travelerDialog.getByLabel('姓名').fill('测试入住人');
        await travelerDialog.getByLabel('身份证号').fill('11010519491231002X');
        await travelerDialog.getByRole('button', {name: '添加', exact: true}).click();

        await page.getByRole('button', {name: '提交订单', exact: true}).click();
        await page.getByRole('button', {name: '确认提交订单'}).click();
        // 下单经由 RabbitMQ saga（order-service -> hotel-service）异步完成，
        // 并行执行时默认 5 秒断言超时不够，这里放宽到 30 秒。
        await expect(page).toHaveURL(/\/reservations\/[0-9a-f-]+/i, {timeout: 30_000});

        await page.getByRole('button', {name: '立即支付'}).click();
        const paymentDialog = page.getByRole('dialog', {name: '支付订单'});
        await paymentDialog.getByLabel('真实姓名').fill('测试付款人');
        await paymentDialog.getByLabel('证件号码').fill('11010519491231002X');
        await paymentDialog.getByLabel('银联卡号').fill('6222021234567894');
        await paymentDialog.getByRole('button', {name: '确认支付'}).click();

        // 支付结果同样经消息投递回写订单状态，超时放宽理由同上。
        await expect(page.getByText('银联卡支付成功，订单状态已经更新。')).toBeVisible({timeout: 30_000});
        await expect(page.getByText('已支付', {exact: true}).first()).toBeVisible({timeout: 30_000});
    } finally {
        await refundIfBooked(page);
    }
});
