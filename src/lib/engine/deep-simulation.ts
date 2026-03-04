import {
	complexityMultiplier,
	coordinationFactors,
	defaultToolProfiles,
	modelProfiles,
	reasoningFactors,
} from '@/lib/data/reference-data'
import { buildCalibrationProfile } from '@/lib/data/reference-store'
import type {
	Bottleneck,
	FailureMode,
	SetupConfig,
	SimulationMode,
	SimulationOptions,
	SimulationResult,
} from '@/lib/types'
import { createRng, chance, clamp01, samplePoisson } from '@/lib/utils/random'
import { hashString, stableStringify } from '@/lib/utils/hash'
import { clamp, makeRange, mean } from '@/lib/utils/stats'

interface StressFactors {
	trafficMultiplier: number
	toolReliabilityDelta: number
	modelQualityDelta: number
	budgetMultiplier: number
	latencyMultiplier: number
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

const stressFactorsFromMode = (mode: SimulationMode, profile?: SimulationOptions['stressProfile']): StressFactors => {
	if (mode !== 'stress') {
		return {
			trafficMultiplier: 1,
			toolReliabilityDelta: 0,
			modelQualityDelta: 0,
			budgetMultiplier: 1,
			latencyMultiplier: 1,
		}
	}

	if (profile === 'traffic_spike') {
		return {
			trafficMultiplier: 1.9,
			toolReliabilityDelta: -0.02,
			modelQualityDelta: -0.02,
			budgetMultiplier: 1,
			latencyMultiplier: 1.2,
		}
	}

	if (profile === 'tool_outage') {
		return {
			trafficMultiplier: 1.2,
			toolReliabilityDelta: -0.16,
			modelQualityDelta: -0.03,
			budgetMultiplier: 1,
			latencyMultiplier: 1.15,
		}
	}

	if (profile === 'budget_shock') {
		return {
			trafficMultiplier: 1.25,
			toolReliabilityDelta: -0.04,
			modelQualityDelta: -0.06,
			budgetMultiplier: 0.75,
			latencyMultiplier: 1.2,
		}
	}

	return {
		trafficMultiplier: 1.7,
		toolReliabilityDelta: -0.11,
		modelQualityDelta: -0.08,
		budgetMultiplier: 0.82,
		latencyMultiplier: 1.32,
	}
}

const heartbeatEventsPerDay = (config: SetupConfig): number => {
	if (config.heartbeats.frequency === 'hourly') {
		return config.workload.hoursPerDay
	}
	if (config.heartbeats.frequency === 'per_task') {
		return config.tasks.reduce((sum, task) => sum + task.arrivalRatePerHour, 0) * config.workload.hoursPerDay
	}
	return 1
}

const getToolProfile = (toolName: string) => {
	return defaultToolProfiles[toolName] ?? {
		name: toolName,
		reliability: 0.9,
		avgLatencyMs: 1800,
		costPerCallUsd: 0.002,
	}
}

const allocateWorker = (availability: number[]): { index: number; freeAt: number } => {
	let lowest = availability[0]
	let index = 0
	for (let i = 1; i < availability.length; i += 1) {
		if (availability[i] < lowest) {
			lowest = availability[i]
			index = i
		}
	}
	return { index, freeAt: lowest }
}

const pickServiceTime = (
	baseLatencyMs: number,
	complexity: number,
	stress: StressFactors,
	rng: ReturnType<typeof createRng>,
): number => {
	const meanLatency = baseLatencyMs * complexity * stress.latencyMultiplier
	const stddev = Math.max(meanLatency * 0.25, 25)
	return Math.max(rng.nextNormal(meanLatency, stddev), 80)
}

export const runDeepSimulation = (
	config: SetupConfig,
	mode: 'deep' | 'stress',
	options: SimulationOptions = {},
): SimulationResult => {
	const iterations = options.iterations ?? (mode === 'stress' ? 260 : 180)
	const baseSeed = options.seed ?? 42
	const stress = stressFactorsFromMode(mode, options.stressProfile)
	const calibrationRuns = options.calibrationRuns ?? (mode === 'stress' ? 5 : 3)
	const calibration = options.disableCalibration
		? {
				enabled: false,
				runsUsed: 0,
				coverage: 0,
				matchedRecords: 0,
				roleAdjustments: config.agents.reduce<
					Record<
						string,
						{
							latencyMultiplier: number
							costMultiplier: number
							qualityDelta: number
							toolReliabilityDelta: number
						}
					>
				>((acc, agent) => {
					acc[agent.id] = {
						latencyMultiplier: 1,
						costMultiplier: 1,
						qualityDelta: 0,
						toolReliabilityDelta: 0,
					}
					return acc
				}, {}),
			}
		: buildCalibrationProfile(config, { runs: calibrationRuns })

	const dailyCostSeries: number[] = []
	const completionSeries: number[] = []
	const reworkSeries: number[] = []
	const throughputSeries: number[] = []
	const latencySeries: number[] = []
	const utilizationSeries: Record<string, number[]> = {}
	const failureCounter: Record<string, number> = {
		queue_timeout: 0,
		tool_failure: 0,
		quality_failure: 0,
		budget_abort: 0,
	}
	const totalTaskSeries: number[] = []

	for (const agent of config.agents) {
		utilizationSeries[agent.id] = []
	}

	const horizonMs = config.workload.hoursPerDay * 3600 * 1000
	const coordination = coordinationFactors[config.coordination.strategy]
	const adjustedBudget = config.governance.budgetDailyUsd * stress.budgetMultiplier

	for (let iteration = 0; iteration < iterations; iteration += 1) {
		const rng = createRng(baseSeed + iteration * 97)
		const roleAvailability = config.agents.reduce<Record<string, number[]>>((acc, agent) => {
			acc[agent.id] = Array.from({ length: agent.count }, () => 0)
			return acc
		}, {})
		const roleBusyTime = config.agents.reduce<Record<string, number>>((acc, agent) => {
			acc[agent.id] = 0
			return acc
		}, {})

		const arrivals: Array<{
			taskName: string
			arrivalAtMs: number
			requiredRoles: string[]
			complexity: number
		}> = []

		for (const task of config.tasks) {
			const lambda = task.arrivalRatePerHour * config.workload.hoursPerDay * stress.trafficMultiplier
			const count = samplePoisson(rng, lambda)
			const complexity = complexityMultiplier[task.complexity]
			for (let i = 0; i < count; i += 1) {
				arrivals.push({
					taskName: task.name,
					arrivalAtMs: rng.nextBetween(0, horizonMs),
					requiredRoles: task.requiredRoles,
					complexity,
				})
			}
		}

		arrivals.sort((a, b) => a.arrivalAtMs - b.arrivalAtMs)

		let completed = 0
		let reworked = 0
		let totalCost = 0
		let totalLatency = 0
		let throughputCount = 0
		let budgetAborted = false

		for (const incomingTask of arrivals) {
			if (budgetAborted) {
				failureCounter.budget_abort += 1
				continue
			}

			let attempt = 0
			let done = false
			let currentTime = incomingTask.arrivalAtMs
			const taskStart = incomingTask.arrivalAtMs

			while (attempt <= config.governance.maxRetries && !done) {
				attempt += 1
				let taskFailed = false
				let attemptCost = 0

				for (const roleId of incomingTask.requiredRoles) {
					const agent = config.agents.find((entry) => entry.id === roleId)
					if (!agent) {
						continue
					}
					const roleCalibration = calibration.roleAdjustments[roleId] ?? {
						latencyMultiplier: 1,
						costMultiplier: 1,
						qualityDelta: 0,
						toolReliabilityDelta: 0,
					}

					const model = modelProfiles[agent.model] ?? fallbackModel
					const reasoning = reasoningFactors[agent.reasoning]
					const workerSet = roleAvailability[roleId]
					if (!workerSet || workerSet.length === 0) {
						taskFailed = true
						failureCounter.queue_timeout += 1
						break
					}

					const { index, freeAt } = allocateWorker(workerSet)
					const handoffPenalty = config.coordination.handoffOverheadMs * coordination.overhead
					const queueDelay = Math.max(freeAt - currentTime, 0)
					if (queueDelay > 20000) {
						failureCounter.queue_timeout += 1
						taskFailed = true
						break
					}

					const serviceLatency = pickServiceTime(
						model.baseLatencyMs / reasoning.speed,
						incomingTask.complexity,
						stress,
						rng,
					) * roleCalibration.latencyMultiplier

					const toolProfiles = agent.toolPermissions.map(getToolProfile)
					const expectedToolCalls = Math.max(
						Math.round(agent.expectedToolCallsPerTask * incomingTask.complexity + rng.nextBetween(-0.4, 1.2)),
						0,
					)
					let toolLatency = 0
					let toolCost = 0
					let toolFailure = false

					for (let toolCall = 0; toolCall < expectedToolCalls; toolCall += 1) {
						const tool = toolProfiles.length ? rng.pick(toolProfiles) : getToolProfile('search')
						toolLatency += Math.max(rng.nextNormal(tool.avgLatencyMs, tool.avgLatencyMs * 0.25), 80)
						toolCost += tool.costPerCallUsd
						const reliability = clamp01(
							tool.reliability + stress.toolReliabilityDelta + roleCalibration.toolReliabilityDelta,
						)
						if (chance(rng, 1 - reliability)) {
							toolFailure = true
						}
					}

					const inputTokens = agent.avgInputTokens * incomingTask.complexity
					const outputTokens = agent.avgOutputTokens * incomingTask.complexity
					const tokenCost =
						(inputTokens / 1000) * model.inputCostPer1kUsd +
						(outputTokens / 1000) * model.outputCostPer1kUsd
					attemptCost += (tokenCost + toolCost) * roleCalibration.costMultiplier

					const quality = clamp(
						model.quality + stress.modelQualityDelta + roleCalibration.qualityDelta,
						0.35,
						0.98,
					)
					const memoryPenalty =
						config.memory.retrievalFailureRate * config.memory.retrievalCadencePerTask *
						(config.memory.strategy === 'shared_store' ? 1.15 : 0.8)
					const failureChance = clamp(
						model.baseFailureRate +
							(1 - quality) * 0.25 +
							memoryPenalty * 0.22 +
							(toolFailure ? 0.28 : 0),
						0.02,
						0.95,
					)

					const startedAt = Math.max(currentTime, freeAt)
					const finishedAt = startedAt + serviceLatency + toolLatency
					workerSet[index] = finishedAt
					roleBusyTime[roleId] += serviceLatency + toolLatency
					currentTime = finishedAt + handoffPenalty

					if (chance(rng, failureChance)) {
						if (toolFailure) {
							failureCounter.tool_failure += 1
						} else {
							failureCounter.quality_failure += 1
						}
						taskFailed = true
						break
					}
				}

				totalCost += attemptCost
				if (totalCost > adjustedBudget) {
					budgetAborted = true
					failureCounter.budget_abort += 1
					taskFailed = true
				}

				if (!taskFailed) {
					completed += 1
					done = true
					totalLatency += currentTime - taskStart
					throughputCount += 1
				} else if (attempt <= config.governance.maxRetries) {
					reworked += 1
					currentTime += 450 + rng.nextBetween(0, 600)
				}
			}

		}

		const totalTasks = arrivals.length
		const completionRate = totalTasks === 0 ? 0 : completed / totalTasks
		const reworkRate = totalTasks === 0 ? 0 : reworked / totalTasks
		const avgLatency = completed === 0 ? horizonMs : totalLatency / completed
		const throughputPerHour = throughputCount / config.workload.hoursPerDay

		dailyCostSeries.push(totalCost)
		completionSeries.push(completionRate)
		reworkSeries.push(reworkRate)
		throughputSeries.push(throughputPerHour)
		latencySeries.push(avgLatency)
		totalTaskSeries.push(totalTasks)

		for (const agent of config.agents) {
			const utilization =
				roleBusyTime[agent.id] / Math.max(horizonMs * Math.max(agent.count, 1), 1)
			utilizationSeries[agent.id].push(utilization)
		}
	}

	const dayCost = makeRange(dailyCostSeries)
	const completionRate = makeRange(completionSeries)
	const reworkRate = makeRange(reworkSeries)
	const throughput = makeRange(throughputSeries)
	const latency = makeRange(latencySeries)

	const roleUtilizationMean = Object.entries(utilizationSeries).reduce<Record<string, number>>((acc, [role, values]) => {
		acc[role] = mean(values)
		return acc
	}, {})

	const bottlenecks: Bottleneck[] = Object.entries(roleUtilizationMean)
		.map(([role, utilization]) => ({
			target: role,
			utilization,
			queueDelayMs: utilization > 0.7 ? (utilization - 0.7) ** 2 * 14000 + 500 : utilization * 280,
			reason:
				utilization > 1
					? 'Role exceeded capacity during simulation windows'
					: utilization > 0.8
						? 'Role approached queue saturation during bursts'
						: 'Role remained stable',
		}))
		.sort((a, b) => b.utilization - a.utilization)

	const totalFailureCount = Object.values(failureCounter).reduce((sum, value) => sum + value, 0)
	const failureModes: FailureMode[] = [
		{
			id: 'queue_timeout',
			label: 'Queue timeout / deadlock pressure',
			likelihood: totalFailureCount === 0 ? 0.05 : failureCounter.queue_timeout / totalFailureCount,
			severity: 0.8,
			impact: 'Task chains stall when worker queues exceed available slots',
			mitigation: 'Increase constrained worker count and split high-complexity arrivals',
		},
		{
			id: 'tool_failure',
			label: 'Tool outage/reliability failures',
			likelihood: totalFailureCount === 0 ? 0.05 : failureCounter.tool_failure / totalFailureCount,
			severity: 0.65,
			impact: 'Dependency outages propagate retries and delayed completions',
			mitigation: 'Add fallback tools and graceful degradation paths',
		},
		{
			id: 'quality_failure',
			label: 'Model quality drift / rework loops',
			likelihood: totalFailureCount === 0 ? 0.05 : failureCounter.quality_failure / totalFailureCount,
			severity: 0.72,
			impact: 'Output quality regressions increase retry pressure',
			mitigation: 'Reserve premium model tier for critical handoffs',
		},
		{
			id: 'budget_abort',
			label: 'Budget cap aborts',
			likelihood: totalFailureCount === 0 ? 0.02 : failureCounter.budget_abort / totalFailureCount,
			severity: 0.9,
			impact: 'Scenario execution halts once daily budget cap is crossed',
			mitigation: 'Lower retries or add budget-aware routing policy',
		},
	]
		.sort((a, b) => b.likelihood * b.severity - a.likelihood * a.severity)
		.slice(0, 5)

	const intervalWidth = completionRate.p90 - completionRate.p10
	const confidenceScore = clamp(
		0.72 - intervalWidth * 0.5 + Math.log10(iterations) * 0.08 + calibration.coverage * 0.08,
		0.52,
		0.95,
	)
	const avgTasksPerDay = mean(totalTaskSeries)

	const heartbeatEvents = heartbeatEventsPerDay(config)
	const heartbeatCost = config.agents.reduce((sum, agent) => {
		const model = modelProfiles[agent.model] ?? fallbackModel
		const heartbeatTokens = (agent.avgInputTokens * 0.25 + agent.avgOutputTokens * 0.2) * agent.count
		const perHeartbeat =
			(heartbeatTokens / 1000) * model.inputCostPer1kUsd + (heartbeatTokens / 1000) * model.outputCostPer1kUsd
		return sum + perHeartbeat
	}, 0)
	const dayCostWithHeartbeat = makeRange([
		dayCost.p10 + heartbeatCost * heartbeatEvents,
		dayCost.p50 + heartbeatCost * heartbeatEvents,
		dayCost.p90 + heartbeatCost * heartbeatEvents,
	])

	const summary =
		`${mode === 'stress' ? 'Stress' : 'Deep'} simulation predicts $${dayCostWithHeartbeat.p50.toFixed(2)}/day ` +
		`with ${(completionRate.p50 * 100).toFixed(1)}% completion and ${(latency.p90 / 1000).toFixed(1)}s p90 latency.`

	return {
		mode,
		setupName: config.name,
		setupHash: hashString(`${mode}:${stableStringify(config)}`),
		summary,
		cost: {
			dayUsd: dayCostWithHeartbeat,
			weekUsd: makeRange([
				dayCostWithHeartbeat.p10 * config.workload.daysPerWeek,
				dayCostWithHeartbeat.p50 * config.workload.daysPerWeek,
				dayCostWithHeartbeat.p90 * config.workload.daysPerWeek,
			]),
			monthUsd: makeRange([
				dayCostWithHeartbeat.p10 * 30,
				dayCostWithHeartbeat.p50 * 30,
				dayCostWithHeartbeat.p90 * 30,
			]),
		},
		performance: {
			completionRate,
			reworkRate,
			throughputPerHour: throughput,
			latencyMs: latency,
		},
		risks: failureModes,
		bottlenecks,
		recommendations: [],
		confidence: {
			score: confidenceScore,
			intervalWidth,
			assumptions: [
				'Stochastic arrivals sampled from Poisson process',
				'Failure events model independent tool/model/memory interactions',
				`Budget cap applied at $${adjustedBudget.toFixed(2)} per simulated day`,
				calibration.enabled
					? `Reference calibration applied from ${calibration.matchedRecords} benchmark records`
					: 'Reference calibration disabled for this run',
			],
			dataQuality:
				calibration.enabled && calibration.coverage > 0.4
					? 'high'
					: mode === 'stress'
						? 'medium'
						: 'low',
		},
		raw: {
			tasksPerDay: avgTasksPerDay,
			totalCostDayMean: mean(dailyCostSeries),
			completionRateMean: mean(completionSeries),
			reworkRateMean: mean(reworkSeries),
			latencyMeanMs: mean(latencySeries),
			utilizationByRole: roleUtilizationMean,
			calibration: {
				enabled: calibration.enabled,
				runsUsed: calibration.runsUsed,
				coverage: calibration.coverage,
				matchedRecords: calibration.matchedRecords,
			},
		},
	}
}
