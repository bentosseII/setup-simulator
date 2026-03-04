import { parseSetupConfig } from '@/lib/schema'
import type { SetupConfig } from '@/lib/types'

export const makeSetup = (overrides?: Partial<SetupConfig>): SetupConfig => {
	const base: SetupConfig = parseSetupConfig({
		name: 'Test setup',
		agents: [
			{
				id: 'coding',
				role: 'coding',
				count: 2,
				provider: 'openai',
				model: 'gpt-4.1-mini',
				reasoning: 'medium',
				toolPermissions: ['github', 'docs'],
				expectedToolCallsPerTask: 2,
				avgInputTokens: 1700,
				avgOutputTokens: 1000,
			},
			{
				id: 'research',
				role: 'research',
				count: 1,
				provider: 'openai',
				model: 'gpt-4.1-mini',
				reasoning: 'medium',
				toolPermissions: ['docs', 'search'],
				expectedToolCallsPerTask: 2,
				avgInputTokens: 1500,
				avgOutputTokens: 900,
			},
		],
		tools: [
			{ name: 'github', reliability: 0.97, avgLatencyMs: 900, costPerCallUsd: 0.002 },
			{ name: 'docs', reliability: 0.95, avgLatencyMs: 1200, costPerCallUsd: 0.001 },
			{ name: 'search', reliability: 0.91, avgLatencyMs: 1600, costPerCallUsd: 0.0015 },
		],
		tasks: [
			{
				name: 'delivery',
				arrivalRatePerHour: 1.5,
				complexity: 'medium',
				requiredRoles: ['coding', 'research'],
				slaMs: 12000,
			},
		],
		coordination: {
			strategy: 'planner_worker',
			handoffOverheadMs: 800,
			maxQueueDepth: 50,
		},
		memory: {
			strategy: 'shared_store',
			retrievalCadencePerTask: 1,
			retrievalFailureRate: 0.08,
			contextWindowTokens: 16000,
		},
		governance: {
			budgetDailyUsd: 100,
			tokenLimitPerTask: 30000,
			maxRetries: 2,
			escalationPolicy: 'manual',
		},
		heartbeats: {
			frequency: 'daily',
			overheadMinutes: 5,
		},
		workload: {
			hoursPerDay: 8,
			daysPerWeek: 5,
		},
	})

	if (!overrides) {
		return base
	}

	return {
		...base,
		...overrides,
	}
}
