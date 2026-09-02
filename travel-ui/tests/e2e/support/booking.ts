import {expect, Page} from '@playwright/test';

/** 与 hotel-payment.spec.ts 共用的日期工具：票务页默认查当天，当天班次可能已全部发出。 */
export function isoDate(offsetDays: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 在下单页添加一位临时出行人（account/components/TravelerSelector.tsx 的弹窗）。 */
export async function addTemporaryTraveler(
    page: Page,
    name = '测试出行人',
    documentNumber = '11010519491231002X',
): Promise<void> {
    await page.getByRole('button', {name: '添加临时出行人'}).click();
    const dialog = page.getByRole('dialog', {name: '添加临时出行人'});
    await dialog.getByLabel('姓名').fill(name);
    await dialog.getByLabel('身份证号').fill(documentNumber);
    await dialog.getByRole('button', {name: '添加', exact: true}).click();
}

/**
 * 票务页下单：查询 → 选班次 → 填出行人 → 提交 → 确认。
 * 返回订单详情页的 reservationId。
 */
export async function bookTicket(page: Page, path: string, resultsHeading: string): Promise<string> {
    await page.goto(path);
    await page.getByLabel('出行日期').fill(isoDate(3));
    await page.getByRole('button', {name: '查询', exact: true}).click();
    await expect(page.getByRole('heading', {name: resultsHeading})).toBeVisible();

    await page.getByRole('button', {name: '去订票'}).first().click();
    await addTemporaryTraveler(page);
    await page.getByRole('button', {name: '提交订单', exact: true}).click();
    await page.getByRole('button', {name: '确认提交订单'}).click();

    // 下单经由 RabbitMQ saga 异步完成，默认 5 秒断言超时不够。
    const reservationUrl = /\/reservations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;
    await expect(page).toHaveURL(reservationUrl, {timeout: 30_000});
    const match = page.url().match(reservationUrl);
    expect(match, '下单后没有跳转到订单详情页').not.toBeNull();
    return match![1];
}

/** 用银联卡完成支付。 */
export async function payWithUnionPay(page: Page): Promise<void> {
    await page.getByRole('button', {name: '立即支付'}).click();
    const dialog = page.getByRole('dialog', {name: '支付订单'});
    await dialog.getByLabel('真实姓名').fill('测试付款人');
    await dialog.getByLabel('证件号码').fill('11010519491231002X');
    await dialog.getByLabel('银联卡号').fill('6222021234567894');
    await dialog.getByRole('button', {name: '确认支付'}).click();
    await expect(page.getByText('银联卡支付成功，订单状态已经更新。')).toBeVisible({timeout: 30_000});
}

/**
 * 释放订单占用的库存。
 *
 * 票务和酒店的库存都是全局的：用例留下的未取消订单会一直占着座位/房间，
 * 下一次运行就会因为无票/无房而失败。因此清理必须放在 finally 里。
 */
export async function cancelReservation(page: Page, reservationId: string): Promise<void> {
    try {
        await page.goto(`/reservations/${reservationId}`);
        const button = page.getByRole('button', {name: /申请退款|取消订单/});
        if (!(await button.isVisible().catch(() => false))) return;
        await button.click();
        const dialog = page.getByRole('dialog', {name: /申请退款|取消订单/});
        await dialog.getByLabel('原因').fill('端到端测试清理');
        await dialog.getByRole('button', {name: '确认提交'}).click();
        await expect(page.getByText(/已退款|已取消/).first()).toBeVisible({timeout: 30_000});
    } catch {
        // 清理失败不改变用例结论，让原始断言错误浮出来。
    }
}
