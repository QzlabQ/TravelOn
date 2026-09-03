import {expect, test} from '@playwright/test';
import {registerThroughUi, uniqueAccount} from './support/auth';
import {bookTicket, payWithUnionPay} from './support/booking';

/**
 * BS-05 售后：取消与退款。
 *
 * hotel-payment.spec.ts 只覆盖到"支付成功"，取消和退款两条分支此前没有 E2E。
 * 这里分别验证未支付订单直接取消、已支付订单走退款。
 */
test('未支付订单可以直接取消', async ({page}) => {
    test.setTimeout(120_000);
    await registerThroughUi(page, uniqueAccount('cancel'));

    await bookTicket(page, '/reservations/flights', '推荐方案');
    await expect(page.getByText('待支付').first()).toBeVisible({timeout: 30_000});

    await page.getByRole('button', {name: '取消订单'}).click();
    const dialog = page.getByRole('dialog', {name: '取消订单'});
    await dialog.getByLabel('原因').fill('行程有变');
    await dialog.getByRole('button', {name: '确认提交'}).click();

    await expect(page.getByText('已取消').first()).toBeVisible({timeout: 30_000});
    await expect(page.getByText('取消原因：行程有变')).toBeVisible();
    // 已取消的订单不应再提供支付入口。
    await expect(page.getByRole('button', {name: '立即支付'})).toHaveCount(0);
});

test('已支付订单申请退款后生成退款记录', async ({page}) => {
    test.setTimeout(150_000);
    await registerThroughUi(page, uniqueAccount('refund'));

    await bookTicket(page, '/reservations/trains', '推荐车次');
    await payWithUnionPay(page);
    await expect(page.getByText('已支付', {exact: true}).first()).toBeVisible({timeout: 30_000});

    await page.getByRole('button', {name: '申请退款'}).click();
    const dialog = page.getByRole('dialog', {name: '申请退款'});
    await dialog.getByLabel('原因').fill('端到端退款测试');
    await dialog.getByRole('button', {name: '确认提交'}).click();

    await expect(page.getByText('已退款').first()).toBeVisible({timeout: 30_000});
    await expect(page.getByText('原因：端到端退款测试').first()).toBeVisible();
});
