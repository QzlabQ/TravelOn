import {expect, test} from '@playwright/test';
import {loginThroughUi, registerThroughUi, uniqueAccount} from './support/auth';

test('用户可以注册、查看账户、退出并重新登录', async ({page}) => {
    const account = uniqueAccount('auth');
    await registerThroughUi(page, account);

    await page.goto('/account');
    await expect(page.getByText(account.email, {exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: '退出登录'})).toBeVisible();

    await page.getByRole('button', {name: '退出登录'}).click();
    await expect(page.getByRole('button', {name: '登录 / 注册'})).toBeVisible();
    await loginThroughUi(page, account);
    await expect(page.getByText(account.email, {exact: true})).toBeVisible();
});
