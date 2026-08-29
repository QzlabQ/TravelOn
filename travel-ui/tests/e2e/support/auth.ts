import {expect, Page} from '@playwright/test';

export type TestAccount = {
    email: string;
    password: string;
    name: string;
};

export const uniqueAccount = (prefix: string): TestAccount => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    return {
        email: `${prefix}-${suffix}@example.test`,
        password: 'Travel123!',
        name: `测试用户${suffix.slice(-6)}`,
    };
};

export async function registerThroughUi(page: Page, account: TestAccount) {
    await page.goto('/');
    await page.getByRole('button', {name: '登录', exact: true}).click();
    await page.getByRole('tab', {name: '注册'}).click();
    await page.getByLabel('真实姓名').fill(account.name);
    await page.getByLabel('邮箱').fill(account.email);
    await page.getByLabel('手机号').fill('13800138000');
    await page.getByLabel('密码').fill(account.password);
    await page.getByRole('button', {name: '立即注册'}).click();
    await expect(page.getByText(account.name, {exact: true})).toBeVisible();
}

export async function loginThroughUi(page: Page, account: TestAccount) {
    await page.getByRole('button', {name: '登录', exact: true}).click();
    await page.getByLabel('邮箱').fill(account.email);
    await page.getByLabel('密码').fill(account.password);
    await page.getByRole('button', {name: '登录', exact: true}).click();
    await expect(page.getByText(account.name, {exact: true})).toBeVisible();
}
