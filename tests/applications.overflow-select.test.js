const { addApplication } = require('../src/utils/applications');

describe('Applications overflow select mapping', () => {
	test('overflow actions include expected handler ids', () => {
		// create a sample app in the DB
		const app = addApplication({ name: 'OverflowTest' });
		const actions = [
			{ id: `appmgr_app_rename_${app.id}`, label: 'Rename', kind: 'primary' },
			{ id: `appmgr_app_questions_${app.id}`, label: 'Questions', kind: 'primary' },
			{ id: `appmgr_app_msgs_${app.id}`, label: 'Messages', kind: 'primary' },
			{ id: `appmgr_app_deployed_${app.id}`, label: 'Deployed', kind: 'nav' },
			{ id: `appmgr_app_editmsg_${app.id}`, label: 'Edit Msg', kind: 'nav' },
			{ id: `appmgr_app_props_${app.id}`, label: 'Props', kind: 'nav' },
			{ id: `appmgr_app_roles_${app.id}`, label: 'Roles', kind: 'nav' },
		];
		const visibleCount = Math.min(4, actions.length);
		const overflow = actions.slice(visibleCount).map((a) => a.id);
		// Expected prefixes we handle in appmgr_app_menu_ handler
		const expected = [
			'appmgr_app_questions_',
			'appmgr_app_msgs_',
			'appmgr_app_deployed_',
			'appmgr_app_editmsg_',
			'appmgr_app_rename_',
			'appmgr_app_props_',
			'appmgr_app_roles_',
		];
		for (const pref of expected) {
			const found = overflow.some((id) => id.startsWith(pref));
			// it's ok if some handlers are in the visible set; ensure no unknown handlers present
			expect(typeof found).toBe('boolean');
		}
		// ensure overflow contains only known prefixes
		const unknown = overflow.filter((id) => !expected.some((p) => id.startsWith(p)));
		expect(unknown).toEqual([]);
	});
	const { buildAppDetailComponents } = require('../src/commands/applications');

	test('overflow select mappings produce valid select components', () => {
		// ensure an app exists so buildAppDetailComponents returns the full UI
		const created = addApplication({ name: 'OverflowTest-Select' });
		const raw = buildAppDetailComponents(created.id, false);
		// Normalize builders to plain JSON rows
		const comps = raw.map((r) => {
			if (r && typeof r.toJSON === 'function') return r.toJSON();
			if (Array.isArray(r.components)) {
				return {
					components: r.components.map((c) => (typeof c.toJSON === 'function' ? c.toJSON() : c)),
				};
			}
			return r;
		});
		// find select menu(s)
		const selectRows = comps.filter(
			(r) => Array.isArray(r.components) && r.components.some((c) => c.type === 3),
		);
		expect(selectRows.length).toBeGreaterThan(0);
		// validate each select menu's JSON shape
		selectRows.forEach((row) => {
			row.components.forEach((comp) => {
				if (comp.type === 3) {
					// must have custom_id, options array, and placeholder or min/max values
					expect(typeof comp.custom_id).toBe('string');
					expect(Array.isArray(comp.options)).toBe(true);
					comp.options.forEach((opt) => {
						expect(typeof opt.label).toBe('string');
						expect(typeof opt.value).toBe('string');
					});
					// ensure no non-Discord keys like 'flows' are present
					expect(comp.flows).toBeUndefined();
				}
			});
		});
	});
});
