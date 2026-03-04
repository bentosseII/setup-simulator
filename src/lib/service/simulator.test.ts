import { describe, expect, it } from 'vitest'

import { runComparison, runOptimizedComparison, runSimulation } from '@/lib/service/simulator'
import { makeSetup } from '@/lib/test-fixtures'

describe('simulation service', () => {
	it('runs simulation from object input and returns recommendations', () => {
		const result = runSimulation({ input: makeSetup(), mode: 'quick' })
		expect(result.summary).toMatch(/Estimated/)
		expect(result.recommendations.length).toBeGreaterThan(0)
	})

	it('compares baseline and variant setups', () => {
		const baseline = JSON.stringify(makeSetup())
		const variant = JSON.stringify(
			makeSetup({
				agents: makeSetup().agents.map((agent) =>
					agent.id === 'coding' ? { ...agent, count: agent.count + 1 } : agent,
				),
			}),
		)

		const comparison = runComparison({ baseline, variant, mode: 'quick' })
		expect(comparison.deltas.throughputP50Pct).toBeGreaterThanOrEqual(-100)
		expect(['baseline', 'variant', 'tie']).toContain(comparison.winner)
	})

	it('builds optimized variant and returns comparison payload', () => {
		const output = runOptimizedComparison({ input: makeSetup(), mode: 'quick' })
		expect(output.baseline.mode).toBe('quick')
		expect(output.variant.mode).toBe('quick')
		expect(output.variant.setupName).toMatch(/optimized variant/i)
	})
})
