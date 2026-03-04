import { describe, expect, it } from 'vitest'

import { parsePromptToSetup, parseSetupInput } from '@/lib/input'

describe('setup input parser', () => {
	it('parses natural language prompt into canonical setup', () => {
		const setup = parsePromptToSetup(
			'Simulate 3 coding agents and 1 research agent, shared memory, daily heartbeat, budget cap $90/day.',
		)
		expect(setup.agents.find((agent) => agent.id === 'coding')?.count).toBe(3)
		expect(setup.agents.find((agent) => agent.id === 'research')?.count).toBe(1)
		expect(setup.memory.strategy).toBe('shared_store')
		expect(setup.heartbeats.frequency).toBe('daily')
		expect(setup.governance.budgetDailyUsd).toBe(90)
	})

	it('parses JSON string setup', () => {
		const setup = parseSetupInput(
			JSON.stringify({
				name: 'json setup',
				agents: [
					{
						id: 'coding',
						role: 'coding',
						count: 1,
						provider: 'openai',
						model: 'gpt-4.1-mini',
						reasoning: 'medium',
						toolPermissions: [],
						expectedToolCallsPerTask: 1,
						avgInputTokens: 1000,
						avgOutputTokens: 700,
					},
				],
				tasks: [
					{
						name: 'task',
						arrivalRatePerHour: 1,
						complexity: 'simple',
						requiredRoles: ['coding'],
					},
				],
				tools: [],
				coordination: { strategy: 'planner_worker', handoffOverheadMs: 600, maxQueueDepth: 10 },
				memory: {
					strategy: 'shared_store',
					retrievalCadencePerTask: 1,
					retrievalFailureRate: 0.05,
					contextWindowTokens: 12000,
				},
				governance: {
					budgetDailyUsd: 50,
					tokenLimitPerTask: 20000,
					maxRetries: 1,
					escalationPolicy: 'manual',
				},
				heartbeats: { frequency: 'daily', overheadMinutes: 5 },
				workload: { hoursPerDay: 8, daysPerWeek: 5 },
			}),
		)

		expect(setup.name).toBe('json setup')
		expect(setup.tasks[0].name).toBe('task')
	})
})
