import {
	complexityMultiplier,
	coordinationFactors,
	defaultToolProfiles,
	modelProfiles,
	reasoningFactors,
} from '@/lib/data/reference-data'
import type {
	Bottleneck,
	ConfidenceSummary,
	FailureMode,
	PerformanceForecast,
	SetupConfig,
	SimulationResult,
} from '@/lib/types'
import { hashString, stableStringify } from '@/lib/utils/hash'
import { clamp, makeRange } from '@/lib/utils/stats'

interface TaskEstimate {
	costPerTask: number
	latencyMs: number
	completionRate: number
	reworkRate: number
	expectedAttempts: number
	arrivalRatePerHour: number
	throughputPerHour: number
	roleDemandPerHour: Record<string, number>
}

const fallbackModel = {
	id: 'fallback',
	provider: 'generic',
	inputCostPer1kUsd: 0.002,
	outputCostPer1kUsd: 0.008,
	baseLatencyMs: 1500,
	tokensPerMinute: 50000,
	quality: 0.75,
	baseFailureRate: 0.14,
}

const memoryPenaltyByStrategy = {
	shared_store: 0.05,
	private_contexts: 0.025,
	hybrid: 0.035,
} as const

const heartbeatEventsPerDay = (config: SetupConfig): number => {
	if (config.heartbeats.frequency === 'hourly') {
		return config.workload.hoursPerDay
	}
	if (config.heartbeats.frequency === 'per_task') {
		return config.tasks.reduce((sum, task) => sum + task.arrivalRatePerHour, 0) * config.workload.hoursPerDay
	}
	return 1
}

const getToolProfile = (name: string) => {
	return defaultToolProfiles[name] ?? {
		name,
		reliability: 0.9,
		avgLatencyMs: 1800,
		costPerCallUsd: 0.002,
	}
}

const expectedAttempts = (successRate: number, maxRetries: number): number => {
	const success = clamp(successRate, 0.01, 0.99)
	const fail = 1 - success
	let attempts = 0
	for (let i = 1; i <= maxRetries + 1; i += 1) {
		attempts += i * success * fail ** (i - 1)
	}
	attempts += (maxRetries + 1) * fail ** (maxRetries + 1)
	return attempts
}

const finalCompletionRate = (onePassSuccess: number, maxRetries: number): number => {
	const fail = 1 - clamp(onePassSuccess, 0.01, 0.99)
	return 1 - fail ** (maxRetries + 1)
}

const estimateTask = (config: SetupConfig, taskName: string): TaskEstimate => {
	const task = config.tasks.find((entry) => entry.name === taskName)
	if (!task) {
		throw new Error(`Unknown task: ${taskName}`)
	}

	const roles = task.requiredRoles
		.map((roleId) => config.agents.find((agent) => agent.id === roleId))
		.filter((agent): agent is SetupConfig['agents'][number] => Boolean(agent))

	if (roles.length === 0) {
		throw new Error(`Task ${task.name} has no valid roles`)
	}

	const complexity = complexityMultiplier[task.complexity]
	const coordination = coordinationFactors[config.coordination.strategy]
	const memoryPenalty =
		memoryPenaltyByStrategy[config.memory.strategy] *
		Math.max(config.memory.retrievalCadencePerTask, 0.2) *
		(1 + config.memory.retrievalFailureRate)

	let baseCost = 0
	let baseLatency = config.coordination.handoffOverheadMs * Math.max(roles.length - 1, 0) * coordination.overhead
	let onePassSuccess = 1
	let toolLatencyTotal = 0
	const roleDemandEntries: Array<[string, number]> = []
	let throughputCeiling = Number.POSITIVE_INFINITY

	for (const role of roles) {
		const model = modelProfiles[role.model] ?? fallbackModel
		const reasoning = reasoningFactors[role.reasoning]
		const roleComplexity = complexity * coordination.overhead

		const inputTokens = role.avgInputTokens * roleComplexity
		const outputTokens = role.avgOutputTokens * roleComplexity
		const tokenCost =
			(inputTokens / 1000) * model.inputCostPer1kUsd + (outputTokens / 1000) * model.outputCostPer1kUsd

		const toolProfiles = role.toolPermissions.map(getToolProfile)
		const expectedToolCalls = role.expectedToolCallsPerTask * roleComplexity
		const avgToolCost =
			toolProfiles.length === 0
				? 0
				: toolProfiles.reduce((sum, tool) => sum + tool.costPerCallUsd, 0) / toolProfiles.length
		const avgToolLatency =
			toolProfiles.length === 0
				? 0
				: toolProfiles.reduce((sum, tool) => sum + tool.avgLatencyMs, 0) / toolProfiles.length
		const avgToolReliability =
			toolProfiles.length === 0
				? 1
				: toolProfiles.reduce((sum, tool) => sum + tool.reliability, 0) / toolProfiles.length

		const toolFailRate = 1 - avgToolReliability ** Math.max(expectedToolCalls, 0)
		const quality = clamp(
			(role.completionProbabilityOverride ?? model.quality) * reasoning.quality * coordination.quality,
			0.25,
			0.99,
		)
		const stepSuccess = clamp(quality * (1 - memoryPenalty) * (1 - toolFailRate), 0.2, 0.99)

		const latencyMs =
			(model.baseLatencyMs * roleComplexity) / reasoning.speed + avgToolLatency * expectedToolCalls
		const serviceMinutes = Math.max(latencyMs / 60000, 0.01)
		const roleCapacityPerHour = (60 / serviceMinutes) * role.count
		throughputCeiling = Math.min(throughputCeiling, roleCapacityPerHour)
		roleDemandEntries.push([role.id, task.arrivalRatePerHour])

		baseCost += tokenCost + avgToolCost * expectedToolCalls
		baseLatency += latencyMs
		toolLatencyTotal += avgToolLatency * expectedToolCalls
		onePassSuccess *= stepSuccess
	}

	const completionRate = finalCompletionRate(onePassSuccess, config.governance.maxRetries)
	const attempts = expectedAttempts(onePassSuccess, config.governance.maxRetries)
	const reworkRate = Math.max(completionRate - onePassSuccess, 0)
	const throughputPerHour = Math.min(task.arrivalRatePerHour, throughputCeiling) * completionRate

	const roleDemandPerHour = roleDemandEntries.reduce<Record<string, number>>((acc, [roleId, demand]) => {
		acc[roleId] = (acc[roleId] ?? 0) + demand * attempts
		return acc
	}, {})

	const queueAmplifier = clamp(
		Object.values(roleDemandPerHour).reduce((sum, demand) => sum + demand, 0) /
			Math.max(throughputCeiling * roles.length, 0.1),
		0,
		2.5,
	)

	const queueDelay = Math.max(baseLatency * Math.max(queueAmplifier - 0.75, 0), 0)

	return {
		costPerTask: baseCost * attempts,
		latencyMs: baseLatency + queueDelay + toolLatencyTotal * 0.1,
		completionRate,
		reworkRate,
		expectedAttempts: attempts,
		arrivalRatePerHour: task.arrivalRatePerHour,
		throughputPerHour,
		roleDemandPerHour,
	}
}

const buildBottlenecks = (
	config: SetupConfig,
	roleUtilization: Record<string, number>,
	roleQueueDelayMs: Record<string, number>,
): Bottleneck[] => {
	return config.agents
		.map((agent) => {
			const utilization = clamp(roleUtilization[agent.id] ?? 0, 0, 2)
			const queueDelayMs = Math.max(roleQueueDelayMs[agent.id] ?? 0, 0)
			const reason =
				utilization > 1
					? 'Role is demand-saturated and accumulates queue backlog'
					: utilization > 0.8
						? 'Role frequently near saturation under current task mix'
						: 'Role has headroom'
			return {
				target: agent.id,
				utilization,
				queueDelayMs,
				reason,
			}
		})
		.sort((a, b) => b.utilization - a.utilization)
}

const buildRiskModes = (
	config: SetupConfig,
	metrics: {
		totalDailyCost: number
		completionRate: number
		averageLatency: number
		roleUtilization: Record<string, number>
		toolReliability: number
	},
): FailureMode[] => {
	const risks: FailureMode[] = []

	const maxUtilization = Math.max(...Object.values(metrics.roleUtilization), 0)
	if (maxUtilization > 0.82) {
		risks.push({
			id: 'queue-pileup',
			label: 'Queue pileups under peak traffic',
			likelihood: clamp((maxUtilization - 0.65) / 0.7, 0.15, 0.98),
			severity: clamp(0.55 + maxUtilization * 0.3, 0.4, 0.95),
			impact: 'Higher p90 latency and increased timeout probability',
			mitigation: 'Increase constrained role capacity or separate queues by task class',
		})
	}

	if (metrics.totalDailyCost > config.governance.budgetDailyUsd) {
		risks.push({
			id: 'budget-overrun',
			label: 'Budget overrun risk',
			likelihood: clamp(metrics.totalDailyCost / config.governance.budgetDailyUsd - 0.7, 0.2, 0.99),
			severity: 0.88,
			impact: 'Daily spend exceeds configured governance cap',
			mitigation: 'Shift non-critical roles to cheaper models and limit retries',
		})
	}

	if (config.memory.strategy === 'shared_store' && config.memory.retrievalCadencePerTask > 1.1) {
		risks.push({
			id: 'memory-contention',
			label: 'Shared memory contention',
			likelihood: clamp(0.35 + config.memory.retrievalCadencePerTask * 0.2, 0.25, 0.9),
			severity: 0.64,
			impact: 'Context fetch failures can trigger rework loops',
			mitigation: 'Move to hybrid memory with role-scoped retrieval policy',
		})
	}

	if (metrics.toolReliability < 0.9) {
		risks.push({
			id: 'tool-outage',
			label: 'Tool reliability bottleneck',
			likelihood: clamp(1 - metrics.toolReliability, 0.1, 0.8),
			severity: 0.57,
			impact: 'Tool failures increase retries and low-confidence completions',
			mitigation: 'Add fallback tools or retry jitter for external tool calls',
		})
	}

	if (metrics.completionRate < 0.7) {
		risks.push({
			id: 'quality-drift',
			label: 'Completion quality below target',
			likelihood: clamp(0.85 - metrics.completionRate, 0.2, 0.85),
			severity: 0.72,
			impact: 'More escalations and rework pressure across queues',
			mitigation: 'Upgrade critical model tiers or add explicit reviewer role',
		})
	}

	if (metrics.averageLatency > 15000) {
		risks.push({
			id: 'sla-miss',
			label: 'SLA miss risk',
			likelihood: clamp((metrics.averageLatency - 10000) / 18000, 0.1, 0.95),
			severity: 0.7,
			impact: 'User-facing latency likely exceeds expected SLA windows',
			mitigation: 'Reduce handoffs or split heavy tasks into separate workflows',
		})
	}

	return risks
		.sort((a, b) => b.likelihood * b.severity - a.likelihood * a.severity)
		.slice(0, 5)
}

const confidenceSummary = (
	config: SetupConfig,
	unknownModelCount: number,
	uncertainty: number,
): ConfidenceSummary => {
	const hasCustomTools = config.tools.length > 0
	const dataQuality = unknownModelCount === 0 && hasCustomTools ? 'high' : unknownModelCount < 2 ? 'medium' : 'low'
	const score = clamp(0.58 + (hasCustomTools ? 0.08 : 0) - unknownModelCount * 0.07 - uncertainty * 0.2, 0.3, 0.88)

	return {
		score,
		intervalWidth: clamp(0.34 + uncertainty * 0.2 + unknownModelCount * 0.03, 0.2, 0.55),
		assumptions: [
			'Arrival rates treated as stationary within each workday',
			'Task quality approximated using benchmark-derived model profiles',
			'Retry behavior assumes independent failure events',
		],
		dataQuality,
	}
}

export const runQuickEstimate = (config: SetupConfig): SimulationResult => {
	const taskEstimates = config.tasks.map((task) => estimateTask(config, task.name))
	const dailyTaskVolume = taskEstimates.reduce(
		(sum, estimate) => sum + estimate.arrivalRatePerHour * config.workload.hoursPerDay,
		0,
	)

	const totalDailyCost = taskEstimates.reduce(
		(sum, estimate) => sum + estimate.costPerTask * estimate.arrivalRatePerHour * config.workload.hoursPerDay,
		0,
	)

	const heartbeatEvents = heartbeatEventsPerDay(config)
	const heartbeatCost = config.agents.reduce((sum, agent) => {
		const model = modelProfiles[agent.model] ?? fallbackModel
		const heartbeatTokens = (agent.avgInputTokens * 0.25 + agent.avgOutputTokens * 0.2) * agent.count
		const perHeartbeat =
			(heartbeatTokens / 1000) * model.inputCostPer1kUsd + (heartbeatTokens / 1000) * model.outputCostPer1kUsd
		return sum + perHeartbeat
	}, 0)
	const totalDailyCostWithHeartbeat = totalDailyCost + heartbeatCost * heartbeatEvents

	const weightedCompletion =
		taskEstimates.reduce((sum, estimate) => {
			return sum + estimate.completionRate * estimate.arrivalRatePerHour
		}, 0) / Math.max(taskEstimates.reduce((sum, estimate) => sum + estimate.arrivalRatePerHour, 0), 1)

	const weightedRework =
		taskEstimates.reduce((sum, estimate) => {
			return sum + estimate.reworkRate * estimate.arrivalRatePerHour
		}, 0) / Math.max(taskEstimates.reduce((sum, estimate) => sum + estimate.arrivalRatePerHour, 0), 1)

	const weightedLatency =
		taskEstimates.reduce((sum, estimate) => {
			return sum + estimate.latencyMs * estimate.arrivalRatePerHour
		}, 0) / Math.max(taskEstimates.reduce((sum, estimate) => sum + estimate.arrivalRatePerHour, 0), 1)

	const throughputPerHour = taskEstimates.reduce((sum, estimate) => sum + estimate.throughputPerHour, 0)

	const roleDemand = taskEstimates.reduce<Record<string, number>>((acc, estimate) => {
		for (const [role, demand] of Object.entries(estimate.roleDemandPerHour)) {
			acc[role] = (acc[role] ?? 0) + demand
		}
		return acc
	}, {})

	const roleUtilization = config.agents.reduce<Record<string, number>>((acc, agent) => {
		const model = modelProfiles[agent.model] ?? fallbackModel
		const reasoning = reasoningFactors[agent.reasoning]
		const tokensPerTask = agent.avgInputTokens + agent.avgOutputTokens
		const capacity =
			((model.tokensPerMinute * reasoning.speed * 60 * agent.count) / Math.max(tokensPerTask, 100)) * 0.92
		acc[agent.id] = roleDemand[agent.id] ? roleDemand[agent.id] / Math.max(capacity, 0.01) : 0
		return acc
	}, {})

	const roleQueueDelayMs = Object.entries(roleUtilization).reduce<Record<string, number>>((acc, [role, utilization]) => {
		if (utilization <= 0.7) {
			acc[role] = utilization * 350
			return acc
		}
		acc[role] = 500 + (utilization - 0.7) ** 2 * 10000
		return acc
	}, {})

	const unknownModelCount = config.agents.filter((agent) => !modelProfiles[agent.model]).length
	const toolReliability =
		config.tools.length > 0
			? config.tools.reduce((sum, tool) => sum + tool.reliability, 0) / config.tools.length
			: 0.92
	const uncertainty = clamp((1 - weightedCompletion) * 0.5 + Math.max(...Object.values(roleUtilization), 0) * 0.2, 0, 1)

	const costVolatility = 0.2 + uncertainty * 0.25
	const perfVolatility = 0.06 + uncertainty * 0.1

	const costDay = makeRange([
		totalDailyCostWithHeartbeat * (1 - costVolatility),
		totalDailyCostWithHeartbeat,
		totalDailyCostWithHeartbeat * (1 + costVolatility * 1.35),
	])

	const completionRange = makeRange([
		clamp(weightedCompletion - perfVolatility, 0, 1),
		clamp(weightedCompletion, 0, 1),
		clamp(weightedCompletion + perfVolatility * 0.65, 0, 1),
	])

	const reworkRange = makeRange([
		clamp(weightedRework * (1 - perfVolatility * 0.5), 0, 1),
		clamp(weightedRework, 0, 1),
		clamp(weightedRework * (1 + perfVolatility * 1.2), 0, 1),
	])

	const latencyRange = makeRange([
		Math.max(weightedLatency * (1 - perfVolatility * 0.25), 100),
		Math.max(weightedLatency, 100),
		Math.max(weightedLatency * (1 + perfVolatility * 2.2 + Math.max(...Object.values(roleUtilization), 0) * 0.2), 100),
	])

	const throughputRange = makeRange([
		Math.max(throughputPerHour * (1 - perfVolatility), 0),
		Math.max(throughputPerHour, 0),
		Math.max(throughputPerHour * (1 + perfVolatility * 0.45), 0),
	])

	const risks = buildRiskModes(config, {
		totalDailyCost: totalDailyCostWithHeartbeat,
		completionRate: weightedCompletion,
		averageLatency: weightedLatency,
		roleUtilization,
		toolReliability,
	})

	const bottlenecks = buildBottlenecks(config, roleUtilization, roleQueueDelayMs)

	const summary =
		`Estimated $${costDay.p50.toFixed(2)}/day with ${(completionRange.p50 * 100).toFixed(1)}% ` +
		`completion and ${(latencyRange.p90 / 1000).toFixed(1)}s p90 latency.`

	return {
		mode: 'quick',
		setupName: config.name,
		setupHash: hashString(stableStringify(config)),
		summary,
		cost: {
			dayUsd: costDay,
			weekUsd: makeRange([costDay.p10 * config.workload.daysPerWeek, costDay.p50 * config.workload.daysPerWeek, costDay.p90 * config.workload.daysPerWeek]),
			monthUsd: makeRange([costDay.p10 * 30, costDay.p50 * 30, costDay.p90 * 30]),
		},
		performance: {
			completionRate: completionRange,
			reworkRate: reworkRange,
			throughputPerHour: throughputRange,
			latencyMs: latencyRange,
		} as PerformanceForecast,
		risks,
		bottlenecks,
		recommendations: [],
		confidence: confidenceSummary(config, unknownModelCount, uncertainty),
		raw: {
			tasksPerDay: dailyTaskVolume,
			totalCostDayMean: totalDailyCostWithHeartbeat,
			completionRateMean: completionRange.p50,
			reworkRateMean: reworkRange.p50,
			latencyMeanMs: latencyRange.p50,
			utilizationByRole: roleUtilization,
		},
	}
}
