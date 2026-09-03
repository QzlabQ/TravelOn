import {expect, test} from '@playwright/test';

test('首页和主要导航可访问', async ({page}) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Tour Central');
    await expect(page.getByRole('link', {name: '酒店', exact: true})).toBeVisible();

    await page.getByRole('link', {name: '酒店', exact: true}).click();
    await expect(page).toHaveURL(/\/reservations\/hotels$/);
    await expect(page.getByRole('heading', {name: '查询酒店'})).toBeVisible();

    await page.getByRole('link', {name: '社区', exact: true}).click();
    await expect(page).toHaveURL(/\/community$/);
});
