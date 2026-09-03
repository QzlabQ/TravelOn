import {expect, test} from '@playwright/test';
import {loginThroughUi, registerThroughUi, uniqueAccount} from './support/auth';

test('用户可以注册、查看账户、退出并重新登录', async ({page}) => {
    const account = uniqueAccount('auth');
    await registerThroughUi(page, account);

    await page.goto('/account');
    await expect(page.getByText(account.email, {exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: '退出登录'})).toBeVisible();

    await page.getByRole('button', {name: '退出登录'}).click();
    const logoutDialog = page.getByRole('dialog', {name: '确认退出登录'});
    await expect(logoutDialog).toBeVisible();
    await logoutDialog.getByRole('button', {name: '退出登录'}).click();
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

/** BS-01 的另一半：常用出行人的增、改、删。此前只覆盖了注册登录。 */
test('常用出行人可以新增、编辑并删除', async ({page}) => {
    test.setTimeout(90_000);
    await registerThroughUi(page, uniqueAccount('traveler'));
    await page.goto('/account');
    await page.getByRole('tab', {name: '实名与出行信息'}).click();

    await expect(page.getByRole('heading', {name: '常用出行人'})).toBeVisible();
    await expect(page.getByText('暂无常用出行人，添加后预订会更快。')).toBeVisible();

    await page.getByRole('button', {name: '新增'}).click();
    await page.getByRole('textbox', {name: '姓名', exact: true}).fill('张三');
    await page.getByRole('textbox', {name: '证件号码', exact: true}).last().fill('11010519491231002X');
    await page.getByLabel('手机号').fill('13800138000');
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await expect(page.getByText('常用出行人已添加。')).toBeVisible();
    await expect(page.getByText('张三', {exact: true})).toBeVisible();

    await page.getByRole('button', {name: '编辑'}).click();
    await page.getByRole('textbox', {name: '姓名', exact: true}).fill('李四');
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await expect(page.getByText('常用出行人已更新。')).toBeVisible();
    await expect(page.getByText('李四', {exact: true})).toBeVisible();
    await expect(page.getByText('张三', {exact: true})).toHaveCount(0);

    await page.getByRole('button', {name: '删除'}).click();
    await expect(page.getByText('常用出行人已删除。')).toBeVisible();
    await expect(page.getByText('暂无常用出行人，添加后预订会更快。')).toBeVisible();
});
