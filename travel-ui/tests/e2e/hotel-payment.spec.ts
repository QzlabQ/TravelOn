import {expect, Locator, Page, test} from '@playwright/test';
import {registerThroughUi, uniqueAccount} from './support/auth';
import {addTemporaryTraveler, cancelReservation, isoDate, payWithUnionPay} from './support/booking';

/**
 * BS-02 酒店查询与住宿预订。
 *
 * 拆成两条用例：筛选不需要登录也不占库存，下单支付需要账号且必须在 finally 里退款。
 * 混在一条里的话，任何一次筛选断言失败都会连带丢掉下单链路的覆盖。
 */

/**
 * 结果卡片定位。
 *
 * HotelBooking.tsx 的 HotelResultCard 是结果区里唯一带 `mb-4 overflow-hidden` 的 section，
 * 外层列表容器用的是 `p-5 shadow-sm`，不会被这个选择器命中。卡片内部没有语义化标记，
 * 评分和价格只能按 class 取——改动这两处样式时需要同步这里。
 */
const hotelCards = (page: Page): Locator => page.locator('section.mb-4.overflow-hidden');

type HotelCard = { name: string; destination: string; rating: number; price: number };

async function readHotelCards(page: Page): Promise<HotelCard[]> {
    // 一次 evaluateAll 取完整页快照：逐个 locator 读的话，读到一半结果集被刷新，
    // nth(i) 会失效并抛超时——expect.poll 遇到异常是直接失败而不是重试的。
    return hotelCards(page).evaluateAll(nodes => nodes.map(node => ({
        name: node.querySelector('h3')?.textContent?.trim() ?? '',
        destination: node.querySelector('p.text-slate-500')?.textContent?.trim() ?? '',
        rating: Number(node.querySelector('.MuiChip-colorPrimary')?.textContent ?? 'NaN'),
        price: Number((node.querySelector('p.text-blue-600')?.textContent ?? '').replace(/\D/g, '')),
    })));
}

/**
 * 等筛选真正落地。
 *
 * 每次改筛选条件都会防抖 350ms 后重查，命中的酒店还要逐个再拉一次社区评分。
 * searchHotels 没有请求竞态保护：先发的查询晚回来时会覆盖后发查询的结果，
 * 用例跑得比网络快时就会看到“筛选没生效”。等到网络静默再断言可以避开这一点。
 */
async function settleSearch(page: Page): Promise<void> {
    await page.waitForLoadState('networkidle');
}

/** 结果区标题右侧的“共 N 家”。分页每页只显示 8 条，跨筛选比较数量必须用这个总数。 */
async function totalHotelCount(page: Page): Promise<number> {
    const text = await page.getByText(/共 \d+ 家|暂无匹配酒店/).first().innerText();
    const match = text.match(/共 (\d+) 家/);
    return match ? Number(match[1]) : 0;
}

/** 筛选是防抖后异步重查的，轮询等到当前页每张卡片都满足条件为止。 */
async function waitForCards(
    page: Page,
    predicate: (card: HotelCard) => boolean,
    message: string,
): Promise<HotelCard[]> {
    await expect
        .poll(async () => {
            const cards = await readHotelCards(page);
            // 返回不满足条件的卡片而不是布尔值：失败信息里能直接看到是哪几家酒店没被筛掉。
            return cards.length === 0 ? ['结果为空'] : cards.filter(card => !predicate(card)).map(card => `${card.name} ${card.rating} 分 ¥${card.price}`);
        }, {message, timeout: 30_000})
        .toEqual([]);
    return readHotelCards(page);
}

/**
 * 点击最低评分。
 *
 * MUI Rating 的 radio input 带 MuiRating-visuallyHidden，Playwright 认为不可见、点不了；
 * 可点的是包着星形图标的 label，按分值取第 value 个。
 */
async function clickMinRating(page: Page, value: number): Promise<void> {
    await page.locator('.MuiRating-root').first().locator('label').nth(value - 1).click();
}

/** 价格区间和最低评分的初值来自账户的预订偏好，先归零才能得到确定的基线结果集。 */
async function resetFilters(page: Page): Promise<void> {
    await page.getByLabel('最低价').fill('');
    await page.getByLabel('最高价').fill('');
    const summary = page.getByText(/^只看 \d 分及以上酒店$/);
    if (await summary.isVisible().catch(() => false)) {
        const current = Number((await summary.innerText()).match(/\d/)![0]);
        await clickMinRating(page, current);
    }
    await expect(page.getByText('当前不限制评分')).toBeVisible();
}

async function searchShanghaiHotels(page: Page): Promise<void> {
    await page.goto('/reservations/hotels');
    await expect(page.getByRole('heading', {name: '酒店列表'})).toBeVisible();

    // Autocomplete 的 label 同时挂在输入框和展开后的 listbox 上，必须按 combobox 角色取。
    const destination = page.getByRole('combobox', {name: '住宿地'});
    await destination.click();
    await destination.fill('上海');
    await page.getByRole('option', {name: /上海市/}).first().click();

    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill(isoDate(3));
    await dateInputs.nth(1).fill(isoDate(4));
    await page.getByRole('button', {name: '查询', exact: true}).click();
    await settleSearch(page);
}

test('酒店列表按目的地、日期、价格和最低评分筛选', async ({page}) => {
    test.setTimeout(120_000);
    await searchShanghaiHotels(page);
    await resetFilters(page);

    await settleSearch(page);
    const baseline = await waitForCards(
        page, card => card.destination.includes('上海'), '筛选上海后仍出现其他城市的酒店',
    );
    const baselineTotal = await totalHotelCount(page);
    expect(baselineTotal).toBeGreaterThan(0);
    // 默认排序是“低价优先”，价格必须单调不降，否则排序其实没生效。
    expect(baseline.map(card => card.price)).toEqual([...baseline.map(card => card.price)].sort((a, b) => a - b));

    // 价格上限取当前最低价：最便宜的那家必然留下，比它贵的必须消失。
    const cheapest = Math.min(...baseline.map(card => card.price));
    await page.getByLabel('最高价').fill(String(cheapest));
    await settleSearch(page);
    const byPrice = await waitForCards(
        page, card => card.price <= cheapest, `设置最高价 ${cheapest} 后仍出现更贵的酒店`,
    );
    expect(byPrice.length).toBeGreaterThan(0);
    if (baseline.some(card => card.price > cheapest)) {
        expect(await totalHotelCount(page)).toBeLessThan(baselineTotal);
    }
    await page.getByLabel('最高价').fill('');
    await settleSearch(page);
    await waitForCards(page, () => true, '清空价格上限后结果没有恢复');

    // 最低评分取当前最高分向下取整：评分最高的那家必然留下，低于阈值的必须消失。
    const threshold = Math.min(5, Math.max(1, Math.floor(Math.max(...baseline.map(card => card.rating)))));
    await clickMinRating(page, threshold);
    await expect(page.getByText(`只看 ${threshold} 分及以上酒店`)).toBeVisible();
    await settleSearch(page);
    const byRating = await waitForCards(
        page, card => card.rating >= threshold, `最低评分 ${threshold} 分后仍出现低于该评分的酒店`,
    );
    expect(byRating.length).toBeGreaterThan(0);
    if (baseline.some(card => card.rating < threshold)) {
        expect(await totalHotelCount(page)).toBeLessThan(baselineTotal);
    }
});

test('进入酒店详情页选择房型下单并完成银联支付', async ({page}) => {
    // 注册、下单、支付三段异步 saga 串在一起，耗时波动大，放宽用例总超时。
    test.setTimeout(180_000);
    await registerThroughUi(page, uniqueAccount('hotel'));
    await searchShanghaiHotels(page);

    const firstCard = hotelCards(page).first();
    await expect(firstCard).toBeVisible({timeout: 30_000});
    const hotelName = (await firstCard.getByRole('heading').first().innerText()).trim();
    await firstCard.getByRole('button', {name: '查看酒店'}).click();

    // 详情页：酒店名、可订房型和住客评价都应真实渲染，而不是停在骨架上。
    await expect(page).toHaveURL(/\/reservations\/hotels\/\d+/);
    await expect(page.getByRole('heading', {name: hotelName, exact: true})).toBeVisible({timeout: 30_000});
    await expect(page.getByRole('heading', {name: '可订房型'})).toBeVisible();
    await expect(page.getByRole('heading', {name: '住客评价'})).toBeVisible();

    let reservationId = '';
    try {
        await page.getByRole('button', {name: '选择房型'}).first().click({timeout: 30_000});
        await expect(page.getByRole('button', {name: '已选择'}).first()).toBeVisible();

        await addTemporaryTraveler(page, '测试入住人');
        await page.getByRole('button', {name: '提交订单', exact: true}).click();
        await page.getByRole('button', {name: '确认提交订单'}).click();

        // 下单经由 RabbitMQ saga（order-service -> travel-core-service）异步完成，
        // 提交成功后详情页还会停留 2 秒再跳转，默认 5 秒断言超时不够。
        const reservationUrl = /\/reservations\/([0-9a-f-]{36})/i;
        await expect(page).toHaveURL(reservationUrl, {timeout: 30_000});
        reservationId = page.url().match(reservationUrl)![1];
        await expect(page.getByText(hotelName).first()).toBeVisible();

        await payWithUnionPay(page);
        await expect(page.getByText('已支付', {exact: true}).first()).toBeVisible({timeout: 30_000});
    } finally {
        // 用例固定预订第一家酒店的第一间房，不退款就会把该房间在这段日期上永久占用，
        // 之后每次运行都拿不到可用房型。清理必须在 finally 中执行。
        if (reservationId) await cancelReservation(page, reservationId);
    }
});
