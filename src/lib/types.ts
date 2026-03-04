export type SimulationMode = 'quick' | 'deep' | 'stress'

export type CoordinationStrategy =
	| 'planner_worker'
	| 'peer_mesh'
	| 'queue_based'
	| 'supervisor_tree'

export type MemoryStrategy = 'shared_store' | 'private_contexts' | 'hybrid'

export type HeartbeatFrequency = 'hourly' | 'daily' | 'per_task'

export type ReasoningLevel = 'low' | 'medium' | 'high'

export type TaskComplexity = 'simple' | 'medium' | 'complex'

export interface AgentRoleConfig {
	id: string
	role: string
	count: number
	provider: string
	model: string
	reasoning: ReasoningLevel
	toolPermissions: string[]
	expectedToolCallsPerTask: number
	avgInputTokens: number
	avgOutputTokens: number
	completionProbabilityOverride?: number
}

export interface ToolConfig {
	name: string
	reliability: number
	avgLatencyMs: number
	costPerCallUsd: number
}

export interface TaskClassConfig {
	name: string
	arrivalRatePerHour: number
	complexity: TaskComplexity
	requiredRoles: string[]
	slaMs?: number
}

export interface CoordinationConfig {
	strategy: CoordinationStrategy
	handoffOverheadMs: number
	maxQueueDepth: number
}

export interface MemoryConfig {
	strategy: MemoryStrategy
	retrievalCadencePerTask: number
	retrievalFailureRate: number
	contextWindowTokens: number
}

export interface GovernanceConfig {
	budgetDailyUsd: number
	tokenLimitPerTask: number
	maxRetries: number
	escalationPolicy: 'none' | 'manual' | 'auto'
}

export interface HeartbeatConfig {
	frequency: HeartbeatFrequency
	overheadMinutes: number
}

export interface WorkloadConfig {
	hoursPerDay: number
	daysPerWeek: number
}

export interface SetupConfig {
	name: string
	agents: AgentRoleConfig[]
	tools: ToolConfig[]
	tasks: TaskClassConfig[]
	coordination: CoordinationConfig
	memory: MemoryConfig
	governance: GovernanceConfig
	heartbeats: HeartbeatConfig
	workload: WorkloadConfig
}

export interface SimulationRange {
	p10: number
	p50: number
	p90: number
}

export interface CostForecast {
	dayUsd: SimulationRange
	weekUsd: SimulationRange
	monthUsd: SimulationRange
}

export interface PerformanceForecast {
	completionRate: SimulationRange
	reworkRate: SimulationRange
	throughputPerHour: SimulationRange
	latencyMs: SimulationRange
}

export interface FailureMode {
	id: string
	label: string
	likelihood: number
	severity: number
	impact: string
	mitigation: string
}

export interface Bottleneck {
	target: string
	utilization: number
	queueDelayMs: number
	reason: string
}

export interface Recommendation {
	id: string
	title: string
	rationale: string
	expectedCostDeltaPct: number
	expectedCompletionDeltaPts: number
	expectedLatencyDeltaPct: number
	confidence: number
}

export interface ConfidenceSummary {
	score: number
	intervalWidth: number
	assumptions: string[]
	dataQuality: 'low' | 'medium' | 'high'
}

export interface CalibrationSummary {
	enabled: boolean
	runsUsed: number
	coverage: number
	matchedRecords: number
}

export interface SimulationResult {
	mode: SimulationMode
	setupName: string
	setupHash: string
	summary: string
	cost: CostForecast
	performance: PerformanceForecast
	risks: FailureMode[]
	bottlenecks: Bottleneck[]
	recommendations: Recommendation[]
	confidence: ConfidenceSummary
	raw: {
		tasksPerDay: number
		totalCostDayMean: number
		completionRateMean: number
		reworkRateMean: number
		latencyMeanMs: number
		utilizationByRole: Record<string, number>
		calibration?: CalibrationSummary
	}
}

export interface ComparisonResult {
	baseline: SimulationResult
	variant: SimulationResult
	deltas: {
		costDayP50Pct: number
		completionRatePts: number
		latencyP50Pct: number
		throughputP50Pct: number
	}
	winner: 'baseline' | 'variant' | 'tie'
	narrative: string
}

export interface SimulationOptions {
	seed?: number
	iterations?: number
	stressProfile?: 'none' | 'traffic_spike' | 'tool_outage' | 'budget_shock' | 'mixed'
	calibrationRuns?: number
	disableCalibration?: boolean
}
