import { defaultToolProfiles, modelProfiles } from '@/lib/data/reference-data'
import type { SetupConfig } from '@/lib/types'
import { clamp, mean } from '@/lib/utils/stats'

export interface BenchmarkRecord {
	id: string
	taskArchetype: 'coding' | 'research' | 'ops' | 'support' | 'review'
	role: string
	model: string
	tools: string[]
	sampleSize: number
	completionRate: number
	reworkRate: number
	p50LatencyMs: number
	p90LatencyMs: number
	costPerTaskUsd: number
	failureRate: number
	updatedAt: string
}

export interface BenchmarkQuery {
	taskArchetype?: BenchmarkRecord['taskArchetype']
	roles?: string[]
	models?: string[]
	tools?: string[]
	minSampleSize?: number
}

interface CalibrationRoleAdjustment {
	latencyMultiplier: number
	costMultiplier: number
	qualityDelta: number
	toolReliabilityDelta: number
}

export interface CalibrationProfile {
	enabled: boolean
	runsUsed: number
	coverage: number
	matchedRecords: number
	roleAdjustments: Record<string, CalibrationRoleAdjustment>
}

const benchmarkCorpus: BenchmarkRecord[] = [
	{
		id: 'coding-gpt41-github-nextjs',
		taskArchetype: 'coding',
		role: 'coding',
		model: 'gpt-4.1',
		tools: ['github', 'docs'],
		sampleSize: 132,
		completionRate: 0.81,
		reworkRate: 0.14,
		p50LatencyMs: 11200,
		p90LatencyMs: 19400,
		costPerTaskUsd: 0.168,
		failureRate: 0.12,
		updatedAt: '2026-02-04',
	},
	{
		id: 'coding-gpt41mini-github-nextjs',
		taskArchetype: 'coding',
		role: 'coding',
		model: 'gpt-4.1-mini',
		tools: ['github', 'docs'],
		sampleSize: 286,
		completionRate: 0.74,
		reworkRate: 0.19,
		p50LatencyMs: 7600,
		p90LatencyMs: 14800,
		costPerTaskUsd: 0.061,
		failureRate: 0.19,
		updatedAt: '2026-02-05',
	},
	{
		id: 'coding-haiku-github',
		taskArchetype: 'coding',
		role: 'coding',
		model: 'claude-haiku-4',
		tools: ['github', 'docs'],
		sampleSize: 214,
		completionRate: 0.68,
		reworkRate: 0.23,
		p50LatencyMs: 6700,
		p90LatencyMs: 13500,
		costPerTaskUsd: 0.044,
		failureRate: 0.25,
		updatedAt: '2026-02-02',
	},
	{
		id: 'coding-gemini-flash',
		taskArchetype: 'coding',
		role: 'coding',
		model: 'gemini-2.5-flash',
		tools: ['github', 'docs', 'search'],
		sampleSize: 165,
		completionRate: 0.7,
		reworkRate: 0.22,
		p50LatencyMs: 6200,
		p90LatencyMs: 13200,
		costPerTaskUsd: 0.031,
		failureRate: 0.24,
		updatedAt: '2026-02-06',
	},
	{
		id: 'research-gpt41mini-search',
		taskArchetype: 'research',
		role: 'research',
		model: 'gpt-4.1-mini',
		tools: ['docs', 'search', 'browser'],
		sampleSize: 248,
		completionRate: 0.79,
		reworkRate: 0.16,
		p50LatencyMs: 8400,
		p90LatencyMs: 16100,
		costPerTaskUsd: 0.071,
		failureRate: 0.16,
		updatedAt: '2026-02-08',
	},
	{
		id: 'research-sonnet-search',
		taskArchetype: 'research',
		role: 'research',
		model: 'claude-sonnet-4',
		tools: ['docs', 'search'],
		sampleSize: 139,
		completionRate: 0.84,
		reworkRate: 0.11,
		p50LatencyMs: 9700,
		p90LatencyMs: 17900,
		costPerTaskUsd: 0.092,
		failureRate: 0.1,
		updatedAt: '2026-02-10',
	},
	{
		id: 'research-gemini-pro-search',
		taskArchetype: 'research',
		role: 'research',
		model: 'gemini-2.5-pro',
		tools: ['docs', 'search', 'browser'],
		sampleSize: 118,
		completionRate: 0.82,
		reworkRate: 0.14,
		p50LatencyMs: 8900,
		p90LatencyMs: 16600,
		costPerTaskUsd: 0.081,
		failureRate: 0.12,
		updatedAt: '2026-02-07',
	},
	{
		id: 'reviewer-gpt41-code-review',
		taskArchetype: 'review',
		role: 'reviewer',
		model: 'gpt-4.1',
		tools: ['github', 'docs'],
		sampleSize: 104,
		completionRate: 0.9,
		reworkRate: 0.07,
		p50LatencyMs: 5400,
		p90LatencyMs: 9900,
		costPerTaskUsd: 0.087,
		failureRate: 0.06,
		updatedAt: '2026-02-11',
	},
	{
		id: 'reviewer-gpt41mini-code-review',
		taskArchetype: 'review',
		role: 'reviewer',
		model: 'gpt-4.1-mini',
		tools: ['github', 'docs'],
		sampleSize: 127,
		completionRate: 0.84,
		reworkRate: 0.1,
		p50LatencyMs: 4100,
		p90LatencyMs: 8200,
		costPerTaskUsd: 0.032,
		failureRate: 0.1,
		updatedAt: '2026-02-09',
	},
	{
		id: 'planner-gpt41-orchestration',
		taskArchetype: 'ops',
		role: 'planner',
		model: 'gpt-4.1',
		tools: ['docs'],
		sampleSize: 92,
		completionRate: 0.88,
		reworkRate: 0.09,
		p50LatencyMs: 4300,
		p90LatencyMs: 9100,
		costPerTaskUsd: 0.054,
		failureRate: 0.08,
		updatedAt: '2026-02-01',
	},
	{
		id: 'ops-gpt41mini-runbook',
		taskArchetype: 'ops',
		role: 'ops',
		model: 'gpt-4.1-mini',
		tools: ['docs', 'search'],
		sampleSize: 173,
		completionRate: 0.83,
		reworkRate: 0.12,
		p50LatencyMs: 6200,
		p90LatencyMs: 12100,
		costPerTaskUsd: 0.043,
		failureRate: 0.11,
		updatedAt: '2026-02-03',
	},
	{
		id: 'support-gpt41mini',
		taskArchetype: 'support',
		role: 'support',
		model: 'gpt-4.1-mini',
		tools: ['docs'],
		sampleSize: 332,
		completionRate: 0.86,
		reworkRate: 0.09,
		p50LatencyMs: 3800,
		p90LatencyMs: 7200,
		costPerTaskUsd: 0.019,
		failureRate: 0.08,
		updatedAt: '2026-02-12',
	},
]

const weightedMean = (records: BenchmarkRecord[], getter: (record: BenchmarkRecord) => number): number => {
	if (records.length === 0) {
		return 0
	}
	const weight = records.reduce((sum, record) => sum + record.sampleSize, 0)
	if (weight <= 0) {
		return mean(records.map(getter))
	}
	return records.reduce((sum, record) => sum + getter(record) * record.sampleSize, 0) / weight
}

const hasToolOverlap = (recordTools: string[], filterTools: string[]): boolean => {
	if (filterTools.length === 0) {
		return true
	}
	return recordTools.some((tool) => filterTools.includes(tool))
}

export const listReferenceRecords = (): BenchmarkRecord[] => {
	return benchmarkCorpus
}

export const queryReferenceRecords = (query: BenchmarkQuery = {}): BenchmarkRecord[] => {
	return benchmarkCorpus.filter((record) => {
		if (query.taskArchetype && record.taskArchetype !== query.taskArchetype) {
			return false
		}
		if (query.roles?.length && !query.roles.includes(record.role)) {
			return false
		}
		if (query.models?.length && !query.models.includes(record.model)) {
			return false
		}
		if (query.tools?.length && !hasToolOverlap(record.tools, query.tools)) {
			return false
		}
		if (query.minSampleSize && record.sampleSize < query.minSampleSize) {
			return false
		}
		return true
	})
}

const clampCalibrationRuns = (runs?: number): number => {
	if (!runs || !Number.isFinite(runs)) {
		return 3
	}
	return Math.round(clamp(runs, 1, 10))
}

const fallbackAdjustment = (): CalibrationRoleAdjustment => ({
	latencyMultiplier: 1,
	costMultiplier: 1,
	qualityDelta: 0,
	toolReliabilityDelta: 0,
})

const findRoleMatches = (role: string, model: string, tools: string[]): BenchmarkRecord[] => {
	const strict = queryReferenceRecords({
		roles: [role],
		models: [model],
		tools,
		minSampleSize: 20,
	})
	if (strict.length > 0) {
		return strict
	}

	const roleAndModel = queryReferenceRecords({
		roles: [role],
		models: [model],
		minSampleSize: 20,
	})
	if (roleAndModel.length > 0) {
		return roleAndModel
	}

	const roleOnly = queryReferenceRecords({
		roles: [role],
		minSampleSize: 20,
	})
	if (roleOnly.length > 0) {
		return roleOnly
	}

	return queryReferenceRecords({
		models: [model],
		minSampleSize: 20,
	})
}

export const buildCalibrationProfile = (
	config: SetupConfig,
	options: { runs?: number } = {},
): CalibrationProfile => {
	const runs = clampCalibrationRuns(options.runs)
	const roleAdjustments: Record<string, CalibrationRoleAdjustment> = {}
	let matchedRecords = 0
	let coverageAccumulator = 0

	for (const agent of config.agents) {
		const matches = findRoleMatches(agent.role, agent.model, agent.toolPermissions)
		matchedRecords += matches.length
		const model = modelProfiles[agent.model]
		if (!model || matches.length === 0) {
			roleAdjustments[agent.id] = fallbackAdjustment()
			continue
		}

		const avgToolCost =
			agent.toolPermissions.length === 0
				? 0
				: mean(
						agent.toolPermissions.map(
							(tool) => (defaultToolProfiles[tool] ?? { costPerCallUsd: 0.002 }).costPerCallUsd,
						),
					)
		const avgToolLatency =
			agent.toolPermissions.length === 0
				? 0
				: mean(
						agent.toolPermissions.map(
							(tool) => (defaultToolProfiles[tool] ?? { avgLatencyMs: 1800 }).avgLatencyMs,
						),
					)
		const avgToolReliability =
			agent.toolPermissions.length === 0
				? 0.93
				: mean(
						agent.toolPermissions.map(
							(tool) => (defaultToolProfiles[tool] ?? { reliability: 0.9 }).reliability,
						),
					)

		const expectedTokenCost =
			(agent.avgInputTokens / 1000) * model.inputCostPer1kUsd +
			(agent.avgOutputTokens / 1000) * model.outputCostPer1kUsd
		const expectedCostPerTask = expectedTokenCost + avgToolCost * Math.max(agent.expectedToolCallsPerTask, 0)
		const expectedLatency = model.baseLatencyMs + avgToolLatency * Math.max(agent.expectedToolCallsPerTask, 0)

		const observedCost = weightedMean(matches, (record) => record.costPerTaskUsd)
		const observedLatency = weightedMean(matches, (record) => record.p50LatencyMs)
		const observedCompletion = weightedMean(matches, (record) => record.completionRate)
		const observedFailure = weightedMean(matches, (record) => record.failureRate)
		const sampleWeight = weightedMean(matches, (record) => record.sampleSize)
		const strength = clamp((Math.log10(sampleWeight + 1) * runs) / 8, 0.2, 1)
		coverageAccumulator += strength

		const rawLatencyMultiplier = clamp(observedLatency / Math.max(expectedLatency, 120), 0.7, 1.9)
		const rawCostMultiplier = clamp(observedCost / Math.max(expectedCostPerTask, 0.001), 0.7, 1.7)
		const rawQualityDelta = clamp((observedCompletion - model.quality) * 0.75, -0.12, 0.12)
		const rawToolDelta = clamp((1 - observedFailure) - avgToolReliability, -0.12, 0.12)

		roleAdjustments[agent.id] = {
			latencyMultiplier: 1 + (rawLatencyMultiplier - 1) * strength,
			costMultiplier: 1 + (rawCostMultiplier - 1) * strength,
			qualityDelta: rawQualityDelta * strength,
			toolReliabilityDelta: rawToolDelta * strength,
		}
	}

	return {
		enabled: true,
		runsUsed: runs,
		coverage: clamp(coverageAccumulator / Math.max(config.agents.length, 1), 0, 1),
		matchedRecords,
		roleAdjustments,
	}
}
