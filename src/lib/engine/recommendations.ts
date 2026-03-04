import { modelProfiles } from '@/lib/data/reference-data'
import type { Recommendation, SetupConfig, SimulationResult } from '@/lib/types'
import { clamp } from '@/lib/utils/stats'

const findCheaperModel = (model: string): string | null => {
	const candidates = ['gpt-4.1-mini', 'claude-haiku-4', 'gemini-2.5-flash']
	if (candidates.includes(model)) {
		return null
	}
	return candidates[0]
}

export const buildRecommendations = (
	config: SetupConfig,
	result: Pick<SimulationResult, 'raw' | 'performance' | 'cost' | 'bottlenecks'>,
): Recommendation[] => {
	const recommendations: Recommendation[] = []

	for (const bottleneck of result.bottlenecks) {
		if (bottleneck.utilization > 0.9) {
			recommendations.push({
				id: `scale-${bottleneck.target}`,
				title: `Scale role: ${bottleneck.target}`,
				rationale: 'Queue pressure indicates this role is the immediate throughput limiter.',
				expectedCostDeltaPct: 12,
				expectedCompletionDeltaPts: 7,
				expectedLatencyDeltaPct: -18,
				confidence: clamp(0.6 + (bottleneck.utilization - 0.9) * 0.4, 0.55, 0.92),
			})
		}
	}

	for (const agent of config.agents) {
		const profile = modelProfiles[agent.model]
		if (!profile) {
			continue
		}
		if (profile.inputCostPer1kUsd + profile.outputCostPer1kUsd < 0.015) {
			continue
		}
		const cheaper = findCheaperModel(agent.model)
		if (!cheaper) {
			continue
		}
		recommendations.push({
			id: `swap-model-${agent.id}`,
			title: `Swap ${agent.id} to ${cheaper}`,
			rationale: 'High-cost model used on broad workload; mixed-tier stack can preserve quality.',
			expectedCostDeltaPct: -22,
			expectedCompletionDeltaPts: -2,
			expectedLatencyDeltaPct: -9,
			confidence: 0.67,
		})
	}

	if (config.memory.strategy === 'shared_store' && config.memory.retrievalCadencePerTask > 1) {
		recommendations.push({
			id: 'memory-hybrid',
			title: 'Move to hybrid memory policy',
			rationale: 'Shared memory is likely adding contention and context retrieval failures.',
			expectedCostDeltaPct: -6,
			expectedCompletionDeltaPts: 4,
			expectedLatencyDeltaPct: -7,
			confidence: 0.72,
		})
	}

	if (result.cost.dayUsd.p50 > config.governance.budgetDailyUsd) {
		recommendations.push({
			id: 'retry-governance',
			title: 'Tighten retry and escalation policy',
			rationale: 'Projected spend exceeds daily cap; reducing retries cuts long-tail burn.',
			expectedCostDeltaPct: -15,
			expectedCompletionDeltaPts: -1,
			expectedLatencyDeltaPct: -5,
			confidence: 0.74,
		})
	}

	if (result.performance.completionRate.p50 < 0.75) {
		recommendations.push({
			id: 'reviewer-role',
			title: 'Add explicit reviewer role',
			rationale: 'Low first-pass completion suggests quality gate should be isolated.',
			expectedCostDeltaPct: 8,
			expectedCompletionDeltaPts: 10,
			expectedLatencyDeltaPct: 4,
			confidence: 0.64,
		})
	}

	if (recommendations.length === 0) {
		recommendations.push({
			id: 'monitor-and-rebalance',
			title: 'Add workload-aware routing policy',
			rationale: 'Even stable setups gain efficiency from queue-aware routing and model tiering.',
			expectedCostDeltaPct: -5,
			expectedCompletionDeltaPts: 2,
			expectedLatencyDeltaPct: -6,
			confidence: 0.58,
		})
	}

	return recommendations
		.sort((a, b) => {
			const aScore = a.expectedCompletionDeltaPts - a.expectedCostDeltaPct * 0.3 - a.expectedLatencyDeltaPct * 0.15
			const bScore = b.expectedCompletionDeltaPts - b.expectedCostDeltaPct * 0.3 - b.expectedLatencyDeltaPct * 0.15
			return bScore - aScore
		})
		.slice(0, 5)
}
