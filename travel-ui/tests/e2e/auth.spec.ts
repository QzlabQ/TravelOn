import {expect, test} from '@playwright/test';
import {loginThroughUi, registerThroughUi, uniqueAccount} from './support/auth';

test('用户可以注册、查看账户、退出并重新登录', async ({page}) => {
    const account = uniqueAccount('auth');
    await registerThroughUi(page, account);

    await page.goto('/account');
    await expect(page.getByText(account.email, {exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: '退出登录'})).toBeVisible();

    await page.getByRole('button', {name: '退出登录'}).click();
    // 退出登录后应用会跳转到首页（Account.tsx 的 logout 末尾调用 navigate("/")），
    // 「登录 / 注册」按钮只存在于 /account 的未登录分支，因此先回到该页再断言。
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/account');
    await expect(page.getByRole('button', {name: '登录 / 注册'})).toBeVisible();
    await loginThroughUi(page, account);
    // 登录经由弹窗完成，账户页需重新进入才会加载出 profile（邮箱在已登录视图中）。
    await page.goto('/account');
    await expect(page.getByText(account.email, {exact: true})).toBeVisible();
});
