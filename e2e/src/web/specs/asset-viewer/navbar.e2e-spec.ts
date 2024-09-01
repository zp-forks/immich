import { AssetMediaResponseDto, LoginResponseDto, SharedLinkType } from '@immich/sdk';
import { expect, test } from '@playwright/test';
import { utils } from 'src/utils';

test.describe('Asset Viewer Navbar', () => {
  let admin: LoginResponseDto;
  let asset: AssetMediaResponseDto;

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    admin = await utils.adminSetup();
  });

  test.beforeEach(async () => {
    asset = await utils.createAsset(admin.accessToken);
  });

  test.describe('shared link without metadata', () => {
    test('visible guest actions', async ({ page }) => {
      const sharedLink = await utils.createSharedLink(admin.accessToken, {
        type: SharedLinkType.Individual,
        assetIds: [asset.id],
        showMetadata: false,
      });
      await page.goto(`/share/${sharedLink.key}/photos/${asset.id}`);
      await page.waitForSelector('#immich-asset-viewer');

      const expected = ['Zoom Image', 'Copy Image', 'Download'];
      const buttons = await page.getByTestId('asset-viewer-navbar-actions').getByRole('button').all();

      for (const [i, button] of buttons.entries()) {
        await expect(button).toHaveAccessibleName(expected[i]);
      }
    });

    test('visible owner actions', async ({ context, page }) => {
      const sharedLink = await utils.createSharedLink(admin.accessToken, {
        type: SharedLinkType.Individual,
        assetIds: [asset.id],
        showMetadata: false,
      });
      await utils.setAuthCookies(context, admin.accessToken);
      await page.goto(`/share/${sharedLink.key}/photos/${asset.id}`);
      await page.waitForSelector('#immich-asset-viewer');

      const expected = ['Share', 'Zoom Image', 'Copy Image', 'Download'];
      const buttons = await page.getByTestId('asset-viewer-navbar-actions').getByRole('button').all();

      for (const [i, button] of buttons.entries()) {
        await expect(button).toHaveAccessibleName(expected[i]);
      }
    });
  });

  test.describe('actions', () => {
    test('favorite asset with shortcut', async ({ context, page }) => {
      await utils.setAuthCookies(context, admin.accessToken);
      await page.goto(`/photos/${asset.id}`);
      await page.waitForSelector('#immich-asset-viewer');
      await page.keyboard.press('f');
      await expect(page.locator('#notification-list').getByTestId('message')).toHaveText('Added to favorites');
    });
  });
});
