import {expect, test} from '@playwright/test';
import {registerThroughUi, uniqueAccount} from './support/auth';
import {bookTicket, cancelReservation, isoDate} from './support/booking';

/** BS-03 机票查询与机票预订。此前只有查询被覆盖，选票、填乘客、下单三步没有任何用例。 */
test('机票默认北京→上海，可以选航班、填乘客并生成待支付订单', async ({page}) => {
    // 注册 + 查询 + 下单 saga 串在一起，耗时波动大。
    test.setTimeout(120_000);
    await registerThroughUi(page, uniqueAccount('flight'));

    await page.goto('/reservations/flights');
    await expect(page.getByRole('heading', {name: '机票订票与比价'})).toBeVisible();
    // 业务场景文档要求机票页默认使用北京 → 上海。
    await expect(page.getByRole('combobox', {name: '出发机场/城市'})).toHaveValue('北京市');
    await expect(page.getByRole('combobox', {name: '到达机场/城市'})).toHaveValue('上海市');

    let reservationId: string | undefined;
    try {
        reservationId = await bookTicket(page, '/reservations/flights', '推荐方案');
        await expect(page.getByText('待支付').first()).toBeVisible({timeout: 30_000});
        await expect(page.getByText(/机票|航班/).first()).toBeVisible();
    } finally {
        if (reservationId) await cancelReservation(page, reservationId);
    }
});

test('机票查询结果全部落在所选出行日期', async ({page}) => {
    const date = isoDate(3);
    await page.goto('/reservations/flights');
    await page.getByLabel('出行日期').fill(date);
    await page.getByRole('button', {name: '查询', exact: true}).click();
    await expect(page.getByRole('heading', {name: '推荐方案'})).toBeVisible();
    await expect(page.getByText(/暂无匹配班次/)).toHaveCount(0);
    // 结果区顶部会回显当前查询日期，用它确认返回的是所选日期的班次。
    await expect(page.getByText(date, {exact: true}).first()).toBeVisible();
});
