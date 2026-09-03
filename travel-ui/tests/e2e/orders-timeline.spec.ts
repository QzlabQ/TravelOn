import {expect, test} from '@playwright/test';
import {registerThroughUi, uniqueAccount} from './support/auth';
import {bookTicket, cancelReservation, payWithUnionPay} from './support/booking';

/**
 * BS-06 统一订单与旅行时间线管理。
 *
 * 这两个页面此前零覆盖：订单列表和 /reservations/timeline 都没有任何用例，
 * 而时间线"只显示已支付且未开始的行程"这条规则恰恰最容易在改动中被破坏。
 */
test('订单列表与旅行时间线按支付状态区分行程', async ({page}) => {
    test.setTimeout(180_000);
    await registerThroughUi(page, uniqueAccount('orders'));

    let paidId: string | undefined;
    let pendingId: string | undefined;
    try {
        paidId = await bookTicket(page, '/reservations/trains', '推荐车次');
        await payWithUnionPay(page);
        await expect(page.getByText('已支付', {exact: true}).first()).toBeVisible({timeout: 30_000});

        pendingId = await bookTicket(page, '/reservations/flights', '推荐方案');
        await expect(page.getByText('待支付').first()).toBeVisible({timeout: 30_000});

        // 订单列表要同时列出两张订单。
        await page.goto('/reservations');
        await expect(page.getByRole('heading', {name: '历史订单', exact: true})).toBeVisible();
        await expect(page.getByText(paidId)).toBeVisible({timeout: 30_000});
        await expect(page.getByText(pendingId)).toBeVisible();

        // 时间线只收已支付且未开始的行程，待支付的那张不该出现。
        await page.getByRole('link', {name: '我的行程'}).click();
        await expect(page).toHaveURL(/\/reservations\/timeline$/);
        await expect(page.getByRole('heading', {name: '我的行程', exact: true})).toBeVisible();
        await expect(page.getByRole('link', {name: '查看订单'})).toHaveAttribute(
            'href', `/reservations/${paidId}`, {timeout: 30_000},
        );
        await expect(page.locator(`a[href="/reservations/${pendingId}"]`)).toHaveCount(0);
    } finally {
        if (paidId) await cancelReservation(page, paidId);
        if (pendingId) await cancelReservation(page, pendingId);
    }
});

test('没有已支付行程时时间线给出空状态而不是报错', async ({page}) => {
    await registerThroughUi(page, uniqueAccount('timeline-empty'));
    await page.goto('/reservations/timeline');
    await expect(page.getByRole('heading', {name: '我的行程', exact: true})).toBeVisible();
    await expect(page.getByRole('heading', {name: '暂无接下来的行程'})).toBeVisible();
});
