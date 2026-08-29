import {expect, test} from '@playwright/test';
import {registerThroughUi, uniqueAccount} from './support/auth';

test('社区帖子可以发布、查看、点赞并删除', async ({page}) => {
    await registerThroughUi(page, uniqueAccount('community'));
    const uniqueTitle = `端到端游记 ${Date.now()}`;

    await page.goto('/community');
    await page.getByRole('button', {name: '发布内容'}).click();
    const publishDialog = page.getByRole('dialog', {name: '发布到广场'});
    await publishDialog.getByLabel('标题').fill(uniqueTitle);
    await publishDialog.getByLabel('正文').fill('这是一条由 Playwright 创建的跨平台端到端测试内容。');
    await publishDialog.getByRole('button', {name: '发布', exact: true}).click();
    await expect(page.getByText('发布成功')).toBeVisible();

    const post = page.getByRole('link').filter({hasText: uniqueTitle});
    await expect(post).toBeVisible();
    await post.click();
    await expect(page.getByRole('heading', {name: uniqueTitle})).toBeVisible();

    const likeButton = page.getByRole('button', {name: /人点赞/});
    await likeButton.click();
    await expect(likeButton).toHaveText('1 人点赞');

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', {name: '删除帖子'}).click();
    await expect(page).toHaveURL(/\/community$/);
    await expect(page.getByText(uniqueTitle)).toHaveCount(0);
});
