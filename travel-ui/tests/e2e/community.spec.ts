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

    // 同一标题会同时出现在列表卡片和侧栏「最新发布」中，取第一个即可，
    // 否则 strict mode 会因命中多个元素而失败。
    const post = page.getByRole('link').filter({hasText: uniqueTitle}).first();
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

/** BS-07 的其余部分：评论与收藏。原用例只覆盖了发帖、点赞、删帖。 */
test('帖子可以评论、点赞评论并收藏', async ({page}) => {
    test.setTimeout(120_000);
    const account = uniqueAccount('community-interaction');
    await registerThroughUi(page, account);

    const uniqueTitle = `互动测试帖 ${Date.now()}`;
    await page.goto('/community');
    await page.getByRole('button', {name: '发布内容'}).click();
    const publishDialog = page.getByRole('dialog', {name: '发布到广场'});
    await publishDialog.getByLabel('标题').fill(uniqueTitle);
    await publishDialog.getByLabel('正文').fill('用于评论与收藏的端到端测试帖子。');
    await publishDialog.getByRole('button', {name: '发布', exact: true}).click();

    const post = page.getByRole('link').filter({hasText: uniqueTitle}).first();
    await expect(post).toBeVisible({timeout: 30_000});
    await post.click();
    await expect(page.getByRole('heading', {name: uniqueTitle})).toBeVisible();

    try {
        await expect(page.getByText('暂无评论')).toBeVisible();
        await page.getByPlaceholder('写下你的评论').fill('第一条端到端评论');
        await page.getByRole('button', {name: '发布评论'}).click();
        await expect(page.getByText('第一条端到端评论')).toBeVisible({timeout: 30_000});
        await expect(page.getByText('1 条评论')).toBeVisible();

        await page.getByRole('button', {name: '收藏', exact: true}).click();
        await expect(page.getByRole('button', {name: '已收藏'})).toBeVisible({timeout: 30_000});

        // 收藏后应出现在「我的」页的收藏列表里。
        await page.goto('/community/me');
        await expect(page.getByText(uniqueTitle).first()).toBeVisible({timeout: 30_000});
    } finally {
        await page.goto('/community');
        const cleanup = page.getByRole('link').filter({hasText: uniqueTitle}).first();
        if (await cleanup.isVisible().catch(() => false)) {
            await cleanup.click();
            await page.getByRole('button', {name: '删除帖子'}).click();
        }
    }
});
