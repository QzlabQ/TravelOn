import {expect, test} from '@playwright/test';
import {registerThroughUi, uniqueAccount} from './support/auth';
import {bookTicket, cancelReservation, isoDate} from './support/booking';

/** BS-04 火车票查询与火车票预订：车次类型筛选、按车次号筛选、席别切换、下单。 */
test('火车票可以按车次类型和车次号筛选', async ({page}) => {
    await page.goto('/reservations/trains');
    await expect(page.getByRole('heading', {name: '火车票订票与比价'})).toBeVisible();
    await page.getByLabel('出行日期').fill(isoDate(3));
    await page.getByRole('button', {name: '查询', exact: true}).click();
    await expect(page.getByRole('heading', {name: '推荐车次'})).toBeVisible();

    // 只留 G/C：结果里不应再出现 D/T/K/Z 开头的车次。
    await page.getByLabel('全选').uncheck();
    await page.getByLabel('G/C').check();
    await expect(page.getByText(/^[DTKZ]\d+$/).first()).toHaveCount(0);

    // 按车次号筛选：输入一个不存在的车次应得到空结果，说明筛选真的生效了。
    await page.getByLabel('按车次筛选').fill('ZZZ9999');
    await expect(page.getByText(/暂无匹配班次/).first()).toBeVisible();

    await page.getByLabel('按车次筛选').fill('');
    await page.getByLabel('全选').check();
    await expect(page.getByText(/暂无匹配班次/)).toHaveCount(0);
});

test('火车票可以切换席别后下单', async ({page}) => {
    test.setTimeout(120_000);
    await registerThroughUi(page, uniqueAccount('train'));

    await page.goto('/reservations/trains');
    // 默认值要等 /transports/tickets/options 与预订偏好取回后才写入，见 flight-booking 的同一处注释。
    await expect(page.getByRole('combobox', {name: '出发站/城市'})).toHaveValue('北京市', {timeout: 30_000});
    await expect(page.getByRole('combobox', {name: '到达站/城市'})).toHaveValue('上海市', {timeout: 30_000});
    await page.getByLabel('出行日期').fill(isoDate(3));
    await page.getByRole('button', {name: '查询', exact: true}).click();
    await expect(page.getByRole('heading', {name: '推荐车次'})).toBeVisible();

    // 同车次可切换席别；有多个席别时切一下，确认价格区域随之更新。
    const seatOptions = page.locator('button', {hasText: /座|卧/});
    if (await seatOptions.count() > 1) {
        await seatOptions.nth(1).click();
        await expect(page.getByText('当前席别').first()).toBeVisible();
    }

    let reservationId: string | undefined;
    try {
        reservationId = await bookTicket(page, '/reservations/trains', '推荐车次');
        await expect(page.getByText('待支付').first()).toBeVisible({timeout: 30_000});
    } finally {
        if (reservationId) await cancelReservation(page, reservationId);
    }
});
