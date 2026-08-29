import {expect, test} from '@playwright/test';

test('首页和主要导航可访问', async ({page}) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Tour Central');
    await expect(page.getByRole('button', {name: '预订'})).toBeVisible();

    await page.getByRole('button', {name: '预订'}).click();
    await page.getByRole('link', {name: '酒店预订'}).click();
    await expect(page).toHaveURL(/\/reservations\/hotels$/);
    await expect(page.getByRole('heading', {name: '酒店预订'})).toBeVisible();

    await page.getByRole('link', {name: '社区'}).click();
    await expect(page).toHaveURL(/\/community$/);
});
