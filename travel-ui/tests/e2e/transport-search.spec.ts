import {expect, test} from '@playwright/test';
import {waitForDefaultTicketLocations} from './support/booking';

// 页面默认查询当天。前端按售票截止时间过滤班次（火车提前 30 分钟、机票提前 90 分钟停售），
// 当天班次全部发出之后查询结果必然为空，测试就会随运行时刻的不同而时通时挂。
// 固定使用明天的日期，让结果与运行时刻无关。
function tomorrow(): string {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

for (const journey of [
    {path: '/reservations/trains', results: '推荐车次'},
    {path: '/reservations/flights', results: '推荐方案'},
]) {
    test(`${journey.path} 可以查询`, async ({page}) => {
        await page.goto(journey.path);
        await expect(page.getByRole('heading', {name: '查询行程'})).toBeVisible();
        await waitForDefaultTicketLocations(page, journey.path);
        await page.getByLabel('出行日期').fill(tomorrow());
        await page.getByRole('button', {name: '查询', exact: true}).click();
        await expect(page.getByRole('heading', {name: journey.results})).toBeVisible();
        await expect(page.getByText(/暂无匹配班次/)).toHaveCount(0);
    });
}
