import { parseSetupConfig } from '@/lib/schema'
import type { Recommendation, SetupConfig } from '@/lib/types'

const cloneSetup = (setup: SetupConfig): SetupConfig => {
	return JSON.parse(JSON.stringify(setup)) as SetupConfig
}

const applyRecommendation = (setup: SetupConfig, recommendation: Recommendation) => {
	if (recommendation.id.startsWith('scale-')) {
		const target = recommendation.id.replace('scale-', '')
		const agent = setup.agents.find((entry) => entry.id === target)
		if (agent) {
			agent.count += 1
		}
		return
	}

	if (recommendation.id.startsWith('swap-model-')) {
		const target = recommendation.id.replace('swap-model-', '')
		const modelMatch = recommendation.title.match(/to\s+([a-z0-9.-]+)/i)
		const agent = setup.agents.find((entry) => entry.id === target)
		if (agent && modelMatch?.[1]) {
			agent.model = modelMatch[1]
		}
		return
	}

	if (recommendation.id === 'memory-hybrid') {
		setup.memory.strategy = 'hybrid'
		setup.memory.retrievalCadencePerTask = Math.max(0.8, setup.memory.retrievalCadencePerTask - 0.3)
		setup.memory.retrievalFailureRate = Math.max(0.03, setup.memory.retrievalFailureRate - 0.02)
		return
	}

	if (recommendation.id === 'retry-governance') {
		setup.governance.maxRetries = Math.max(1, setup.governance.maxRetries - 1)
		return
	}

	if (recommendation.id === 'reviewer-role') {
		const existing = setup.agents.find((agent) => agent.id === 'reviewer')
		if (!existing) {
			setup.agents.push({
				id: 'reviewer',
				role: 'reviewer',
				count: 1,
				provider: 'openai',
				model: 'gpt-4.1-mini',
				reasoning: 'high',
				toolPermissions: ['github', 'docs'],
				expectedToolCallsPerTask: 1,
				avgInputTokens: 1000,
				avgOutputTokens: 600,
			})
			setup.tasks = setup.tasks.map((task) => ({
				...task,
				requiredRoles: task.requiredRoles.includes('reviewer')
					? task.requiredRoles
					: [...task.requiredRoles, 'reviewer'],
			}))
		}
	}
}

export const buildOptimizedVariant = (
	baseline: SetupConfig,
	recommendations: Recommendation[],
): SetupConfig => {
	const variant = cloneSetup(baseline)
	variant.name = `${baseline.name} (optimized variant)`

	for (const recommendation of recommendations.slice(0, 2)) {
		applyRecommendation(variant, recommendation)
	}

	return parseSetupConfig(variant)
}
