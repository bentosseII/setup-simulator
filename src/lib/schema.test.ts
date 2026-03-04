import { describe, expect, it } from 'vitest'

import { parseSetupConfig } from '@/lib/schema'
import { makeSetup } from '@/lib/test-fixtures'

describe('setup schema', () => {
	it('accepts valid setup config', () => {
		const setup = parseSetupConfig(makeSetup())
		expect(setup.agents).toHaveLength(2)
		expect(setup.tasks[0].requiredRoles).toEqual(['coding', 'research'])
	})

	it('rejects task role references that are missing from agents', () => {
		expect(() =>
			parseSetupConfig({
				...makeSetup(),
				tasks: [
					{
						name: 'bad-task',
						arrivalRatePerHour: 1,
						complexity: 'medium',
						requiredRoles: ['ghost-role'],
					},
				],
			}),
		).toThrowError(/missing role/i)
	})
})
