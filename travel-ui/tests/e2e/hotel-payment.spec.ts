import {expect, test} from '@playwright/test';
import {registerThroughUi, uniqueAccount} from './support/auth';

test('酒店查询、下单、银联支付和订单状态形成完整闭环', async ({page}) => {
    await registerThroughUi(page, uniqueAccount('hotel'));
    await page.goto('/reservations/hotels');

    await expect(page.getByRole('heading', {name: '酒店列表'})).toBeVisible();
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
    await expect(page).toHaveURL(/\/reservations\/[0-9a-f-]+/i);

    await page.getByRole('button', {name: '立即支付'}).click();
    const paymentDialog = page.getByRole('dialog', {name: '支付订单'});
    await paymentDialog.getByLabel('真实姓名').fill('测试付款人');
    await paymentDialog.getByLabel('证件号码').fill('11010519491231002X');
    await paymentDialog.getByLabel('银联卡号').fill('6222021234567894');
    await paymentDialog.getByRole('button', {name: '确认支付'}).click();

    await expect(page.getByText('银联卡支付成功，订单状态已经更新。')).toBeVisible();
    await expect(page.getByText('已支付', {exact: true}).first()).toBeVisible();
});
