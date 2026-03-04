import { describe, expect, it } from 'vitest'

import {
	buildCalibrationProfile,
	listReferenceRecords,
	queryReferenceRecords,
} from '@/lib/data/reference-store'
import { makeSetup } from '@/lib/test-fixtures'

describe('reference data store', () => {
	it('returns benchmark records with filters', () => {
		const all = listReferenceRecords()
		expect(all.length).toBeGreaterThan(5)

		const codingGpt41 = queryReferenceRecords({
			roles: ['coding'],
			models: ['gpt-4.1'],
			tools: ['github'],
		})

		expect(codingGpt41.length).toBeGreaterThan(0)
		expect(codingGpt41.every((record) => record.role === 'coding')).toBe(true)
	})

	it('builds calibration profile with role-level adjustments', () => {
		const profile = buildCalibrationProfile(makeSetup(), { runs: 4 })
		expect(profile.enabled).toBe(true)
		expect(profile.runsUsed).toBe(4)
		expect(profile.coverage).toBeGreaterThan(0)
		expect(profile.matchedRecords).toBeGreaterThan(0)

		const coding = profile.roleAdjustments.coding
		expect(coding).toBeDefined()
		expect(coding.costMultiplier).not.toBe(1)
	})
})
