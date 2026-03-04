import { describe, expect, it } from 'vitest'

import { buildOptimizedVariant } from '@/lib/engine/optimize'
import { makeSetup } from '@/lib/test-fixtures'

describe('optimized variant builder', () => {
	it('applies top recommendations to produce new config', () => {
		const baseline = makeSetup()
		const variant = buildOptimizedVariant(baseline, [
			{
				id: 'scale-coding',
				title: 'Scale role: coding',
				rationale: '',
				expectedCostDeltaPct: 5,
				expectedCompletionDeltaPts: 8,
				expectedLatencyDeltaPct: -16,
				confidence: 0.7,
			},
			{
				id: 'memory-hybrid',
				title: 'Move to hybrid memory policy',
				rationale: '',
				expectedCostDeltaPct: -4,
				expectedCompletionDeltaPts: 3,
				expectedLatencyDeltaPct: -7,
				confidence: 0.7,
			},
		])

		expect(variant.name).toContain('optimized variant')
		expect(variant.agents.find((agent) => agent.id === 'coding')?.count).toBe(3)
		expect(variant.memory.strategy).toBe('hybrid')
	})
})
