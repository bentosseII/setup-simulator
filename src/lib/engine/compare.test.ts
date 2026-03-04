import { describe, expect, it } from 'vitest'

import { compareResults } from '@/lib/engine/compare'
import { runQuickEstimate } from '@/lib/engine/quick-estimate'
import { makeSetup } from '@/lib/test-fixtures'

describe('comparison engine', () => {
	it('computes metric deltas and winner', () => {
		const baseline = runQuickEstimate(makeSetup())
		const variant = runQuickEstimate(
			makeSetup({
				agents: makeSetup().agents.map((agent) =>
					agent.id === 'coding' ? { ...agent, count: agent.count + 1 } : agent,
				),
			}),
		)
		const comparison = compareResults(baseline, variant)
		expect(comparison.deltas).toHaveProperty('costDayP50Pct')
		expect(comparison.narrative.length).toBeGreaterThan(10)
	})
})
