import { describe, expect, it } from 'vitest'

import { runQuickEstimate } from '@/lib/engine/quick-estimate'
import { makeSetup } from '@/lib/test-fixtures'

describe('quick estimate engine', () => {
	it('returns summary metrics and ranges', () => {
		const result = runQuickEstimate(makeSetup())
		expect(result.mode).toBe('quick')
		expect(result.cost.dayUsd.p50).toBeGreaterThan(0)
		expect(result.performance.completionRate.p50).toBeGreaterThan(0)
		expect(result.performance.completionRate.p90).toBeLessThanOrEqual(1)
		expect(result.bottlenecks.length).toBeGreaterThan(0)
	})

	it('increases projected cost under higher arrival rates', () => {
		const baseline = runQuickEstimate(makeSetup())
		const heavy = runQuickEstimate(
			makeSetup({
				tasks: [
					{
						...makeSetup().tasks[0],
						arrivalRatePerHour: 3.2,
					},
				],
			}),
		)
		expect(heavy.cost.dayUsd.p50).toBeGreaterThan(baseline.cost.dayUsd.p50)
	})

	it('flags budget risk when projected spend exceeds cap', () => {
		const result = runQuickEstimate(
			makeSetup({
				agents: makeSetup().agents.map((agent) =>
					agent.id === 'coding' ? { ...agent, model: 'gpt-4.1' } : agent,
				),
				tasks: [
					{
						...makeSetup().tasks[0],
						arrivalRatePerHour: 4.5,
					},
				],
				governance: {
					...makeSetup().governance,
					budgetDailyUsd: 1,
				},
			}),
		)
		expect(result.risks.some((risk) => risk.id === 'budget-overrun')).toBe(true)
	})
})
