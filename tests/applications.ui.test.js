const appsModule = require('../src/commands/applications');
const {
	listApplications,
	addApplication,
	removeApplication,
} = require('../src/utils/applications');

describe('Applications UI builders', () => {
	beforeEach(() => {
		// reset applications data file by removing all existing apps
		const apps = listApplications();
		for (const a of apps.slice()) removeApplication(a.id);
	});

	test('selection buttons are chunked to max 5 per row', () => {
		// create 12 apps
		for (let i = 0; i < 12; i++) addApplication({ name: `App ${i}` });
		const { embed, page, totalPages, apps } = appsModule._test.buildApplicationsListEmbed(0, 5);
		const components = appsModule._test.buildApplicationsListComponents(page, totalPages, apps);
		// components are ActionRow-like objects (buildNavRow returns objects with components array)
		const selectionRows = components.slice(0, components.length - 1);
		for (const row of selectionRows) {
			expect(row.components.length).toBeLessThanOrEqual(5);
		}
	});

	test('bottom row contains Back, Create and Delete; Prev/Next only when needed', () => {
		// ensure small number (<=pageSize) — no Prev/Next expected
		for (let i = 0; i < 3; i++) addApplication({ name: `SApp ${i}` });
		const { embed, page, totalPages, apps } = appsModule._test.buildApplicationsListEmbed(0, 5);
		const components = appsModule._test.buildApplicationsListComponents(page, totalPages, apps);
		const bottom = components[components.length - 1];
		// ButtonBuilder has .toJSON(); check customIds present
		const ids = bottom.components.map(
			(c) => (c.toJSON && c.toJSON().custom_id) || c.customId || '',
		);
		expect(ids).toEqual(
			expect.arrayContaining(['appmgr_apps_create', 'appmgr_apps_delete', 'appmgr_back_root']),
		);
		// No Prev/Next in this case
		expect(ids).not.toEqual(expect.arrayContaining(['appmgr_apps_prev', 'appmgr_apps_next']));

		// Create enough apps for multiple pages
		for (let i = 0; i < 10; i++) addApplication({ name: `PApp ${i}` });
		const multi = appsModule._test.buildApplicationsListEmbed(0, 5);
		const componentsMulti = appsModule._test.buildApplicationsListComponents(
			multi.page,
			multi.totalPages,
			multi.apps,
		);
		const bottomMulti = componentsMulti[componentsMulti.length - 1];
		const idsMulti = bottomMulti.components.map(
			(c) => (c.toJSON && c.toJSON().custom_id) || c.customId || '',
		);
		// Prev should be absent on page 0, Next should be present
		expect(idsMulti).toEqual(
			expect.arrayContaining(['appmgr_apps_create', 'appmgr_apps_delete', 'appmgr_back_root']),
		);
		expect(idsMulti).toEqual(expect.arrayContaining(['appmgr_apps_next']));
	});
});
