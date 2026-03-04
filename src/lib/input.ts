import YAML from 'yaml'

import { parseSetupConfig } from '@/lib/schema'
import type { SetupConfig, TaskComplexity } from '@/lib/types'

const knownRoles = new Set(['coding', 'research', 'reviewer', 'planner', 'ops', 'support'])

export const defaultSetup = (): SetupConfig => {
	return parseSetupConfig({
		name: 'Default multi-agent setup',
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
				avgInputTokens: 1800,
				avgOutputTokens: 1300,
			},
			{
				id: 'research',
				role: 'research',
				count: 1,
				provider: 'openai',
				model: 'gpt-4.1-mini',
				reasoning: 'medium',
				toolPermissions: ['docs', 'search'],
				expectedToolCallsPerTask: 3,
				avgInputTokens: 1400,
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
				name: 'feature_delivery',
				arrivalRatePerHour: 1.2,
				complexity: 'medium',
				requiredRoles: ['coding', 'research'],
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
}

const parseRoleCounts = (prompt: string): Array<{ role: string; count: number }> => {
	const matches = [...prompt.matchAll(/(\d+)\s+([a-z]+)\s+agents?/gi)]
	if (matches.length === 0) {
		return []
	}

	return matches
		.map((match) => ({
			role: match[2].toLowerCase().replace(/[^a-z]/g, ''),
			count: Number(match[1]),
		}))
		.filter((item) => knownRoles.has(item.role) && Number.isFinite(item.count) && item.count > 0)
}

const parseComplexity = (prompt: string): TaskComplexity => {
	if (prompt.includes('complex') || prompt.includes('advanced')) {
		return 'complex'
	}
	if (prompt.includes('simple') || prompt.includes('lightweight')) {
		return 'simple'
	}
	return 'medium'
}

export const parsePromptToSetup = (prompt: string): SetupConfig => {
	const lower = prompt.toLowerCase()
	const seed = defaultSetup()

	const roles = parseRoleCounts(lower)
	const reasoning = lower.includes('high reasoning')
		? 'high'
		: lower.includes('low reasoning')
			? 'low'
			: 'medium'

	const memoryStrategy = lower.includes('private memory')
		? 'private_contexts'
		: lower.includes('hybrid memory')
			? 'hybrid'
			: lower.includes('shared memory')
				? 'shared_store'
				: seed.memory.strategy

	const coordination = lower.includes('peer mesh')
		? 'peer_mesh'
		: lower.includes('queue')
			? 'queue_based'
			: lower.includes('supervisor')
				? 'supervisor_tree'
				: seed.coordination.strategy

	const heartbeat = lower.includes('hourly heartbeat')
		? 'hourly'
		: lower.includes('per task heartbeat')
			? 'per_task'
			: lower.includes('daily heartbeat')
				? 'daily'
				: seed.heartbeats.frequency

	const budgetMatch = lower.match(/\$\s*(\d+(?:\.\d+)?)\s*\/?\s*day/)
	const budget = budgetMatch ? Number(budgetMatch[1]) : seed.governance.budgetDailyUsd

	const toolNames = ['github', 'docs', 'browser', 'search'].filter((tool) => lower.includes(tool))

	const hasNext = lower.includes('next.js') || lower.includes('nextjs')
	const model = reasoning === 'high' ? 'gpt-4.1' : 'gpt-4.1-mini'
	const parsedAgents = roles.length
		? roles.map((item) => ({
				id: item.role,
				role: item.role,
				count: item.count,
				provider: 'openai',
				model,
				reasoning,
				toolPermissions: toolNames.length ? toolNames : seed.tools.map((tool) => tool.name),
				expectedToolCallsPerTask: reasoning === 'high' ? 3 : 2,
				avgInputTokens: hasNext ? 2200 : 1600,
				avgOutputTokens: hasNext ? 1400 : 1000,
			}))
		: seed.agents

	const codingExists = parsedAgents.some((agent) => agent.id === 'coding')
	const researchExists = parsedAgents.some((agent) => agent.id === 'research')
	const reviewerExists = parsedAgents.some((agent) => agent.id === 'reviewer')

	const requiredRoles = [
		codingExists ? 'coding' : parsedAgents[0]?.id,
		researchExists ? 'research' : undefined,
		reviewerExists ? 'reviewer' : undefined,
	].filter((value): value is string => Boolean(value))

	const tasks = [
		{
			name: hasNext ? 'nextjs_feature_delivery' : 'delivery_workflow',
			arrivalRatePerHour: parsedAgents.reduce((sum, agent) => sum + agent.count, 0) * 0.42,
			complexity: parseComplexity(lower),
			requiredRoles: requiredRoles.length ? requiredRoles : [parsedAgents[0]?.id ?? 'coding'],
			slaMs: hasNext ? 14000 : 12000,
		},
	]

	const tools = toolNames.length
		? toolNames.map((name) => {
			const existing = seed.tools.find((item) => item.name === name)
			if (existing) {
				return existing
			}
			return {
				name,
				reliability: 0.93,
				avgLatencyMs: 1500,
				costPerCallUsd: 0.002,
			}
		})
		: seed.tools

	return parseSetupConfig({
		name: 'Prompt-derived setup',
		agents: parsedAgents,
		tools,
		tasks,
		coordination: {
			...seed.coordination,
			strategy: coordination,
		},
		memory: {
			...seed.memory,
			strategy: memoryStrategy,
			retrievalCadencePerTask: memoryStrategy === 'shared_store' ? 1.2 : 0.8,
		},
		governance: {
			...seed.governance,
			budgetDailyUsd: budget,
		},
		heartbeats: {
			...seed.heartbeats,
			frequency: heartbeat,
		},
		workload: seed.workload,
	})
}

const parseObjectLikeInput = (value: string): unknown | null => {
	const trimmed = value.trim()
	if (!trimmed) {
		return null
	}

	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		try {
			return JSON.parse(trimmed)
		} catch {
			return null
		}
	}

	if (trimmed.includes(':')) {
		try {
			return YAML.parse(trimmed)
		} catch {
			return null
		}
	}

	return null
}

export const parseSetupInput = (input: unknown): SetupConfig => {
	if (typeof input === 'string') {
		const parsed = parseObjectLikeInput(input)
		if (parsed && typeof parsed === 'object') {
			return parseSetupConfig(parsed)
		}
		return parsePromptToSetup(input)
	}

	if (!input || typeof input !== 'object') {
		throw new Error('Setup input must be a prompt string, JSON, or YAML object')
	}

	return parseSetupConfig(input)
}
