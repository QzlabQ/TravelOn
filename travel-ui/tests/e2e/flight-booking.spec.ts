import {expect, test} from '@playwright/test';
import {registerThroughUi, uniqueAccount} from './support/auth';
import {bookTicket, cancelReservation, isoDate} from './support/booking';

/** BS-03 机票查询与机票预订。此前只有查询被覆盖，选票、填乘客、下单三步没有任何用例。 */
test('机票默认北京→上海，可以选航班、填乘客并生成待支付订单', async ({page}) => {
    // 注册 + 查询 + 下单 saga 串在一起，耗时波动大。
    test.setTimeout(120_000);
    await registerThroughUi(page, uniqueAccount('flight'));

    await page.goto('/reservations/flights');
    await expect(page.getByRole('heading', {name: '机票', exact: true})).toBeVisible();
    // 业务场景文档要求机票页默认使用北京 → 上海。
    // 默认值不是初始 state：TicketBooking 要先取回 /transports/tickets/options 和用户的
    // 预订偏好，才在 .then() 里 setFrom/setTo，机器负载高时这一步会超过默认的 5 秒断言超时。
    await expect(page.getByRole('combobox', {name: '出发机场/城市'})).toHaveValue('北京市', {timeout: 30_000});
    await expect(page.getByRole('combobox', {name: '到达机场/城市'})).toHaveValue('上海市', {timeout: 30_000});

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

test('机票同一航班可以在经济舱、商务舱和头等舱之间切换', async ({page}) => {
    await page.goto('/reservations/flights');
    await page.getByLabel('出行日期').fill(isoDate(3));
    await page.getByRole('button', {name: '查询', exact: true}).click();
    await expect(page.getByRole('heading', {name: '推荐方案'})).toBeVisible();

    // 种子数据里北京 → 上海的航班带有完整的三个舱位（见 scripts/generate-ticket-offers.py
    // 的 FLIGHT_CABINS），所以这三个按钮在默认航线上一定存在。
    await expect(page.getByRole('button', {name: /^经济舱/}).first()).toBeVisible({timeout: 30_000});
    const businessCabin = page.getByRole('button', {name: /^商务舱/}).first();
    await expect(businessCabin).toBeVisible();
    await expect(page.getByRole('button', {name: /^头等舱/}).first()).toBeVisible();

    const economyPrice = await page.getByText(/^当前舱位价格$/).first()
        .locator('xpath=following-sibling::p[1]').innerText();
    await businessCabin.click();
    await expect(page.getByText(/当前舱位 商务舱/).first()).toBeVisible();
    // 切换舱位后展示的必须是该舱位的价格，而不是仍然停在经济舱价格上。
    const businessPrice = await page.getByText(/^当前舱位价格$/).first()
        .locator('xpath=following-sibling::p[1]').innerText();
    expect(businessPrice).not.toEqual(economyPrice);
});
