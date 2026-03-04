export interface ModelProfile {
	id: string
	provider: string
	inputCostPer1kUsd: number
	outputCostPer1kUsd: number
	baseLatencyMs: number
	tokensPerMinute: number
	quality: number
	baseFailureRate: number
}

export interface ToolProfile {
	name: string
	reliability: number
	avgLatencyMs: number
	costPerCallUsd: number
}

export const modelProfiles: Record<string, ModelProfile> = {
	'gpt-4.1': {
		id: 'gpt-4.1',
		provider: 'openai',
		inputCostPer1kUsd: 0.01,
		outputCostPer1kUsd: 0.03,
		baseLatencyMs: 2200,
		tokensPerMinute: 30000,
		quality: 0.87,
		baseFailureRate: 0.08,
	},
	'gpt-4.1-mini': {
		id: 'gpt-4.1-mini',
		provider: 'openai',
		inputCostPer1kUsd: 0.002,
		outputCostPer1kUsd: 0.008,
		baseLatencyMs: 1200,
		tokensPerMinute: 60000,
		quality: 0.78,
		baseFailureRate: 0.12,
	},
	'claude-sonnet-4': {
		id: 'claude-sonnet-4',
		provider: 'anthropic',
		inputCostPer1kUsd: 0.003,
		outputCostPer1kUsd: 0.015,
		baseLatencyMs: 1700,
		tokensPerMinute: 45000,
		quality: 0.83,
		baseFailureRate: 0.1,
	},
	'claude-haiku-4': {
		id: 'claude-haiku-4',
		provider: 'anthropic',
		inputCostPer1kUsd: 0.001,
		outputCostPer1kUsd: 0.005,
		baseLatencyMs: 900,
		tokensPerMinute: 70000,
		quality: 0.73,
		baseFailureRate: 0.14,
	},
	'gemini-2.5-pro': {
		id: 'gemini-2.5-pro',
		provider: 'google',
		inputCostPer1kUsd: 0.0035,
		outputCostPer1kUsd: 0.01,
		baseLatencyMs: 1900,
		tokensPerMinute: 50000,
		quality: 0.85,
		baseFailureRate: 0.09,
	},
	'gemini-2.5-flash': {
		id: 'gemini-2.5-flash',
		provider: 'google',
		inputCostPer1kUsd: 0.0007,
		outputCostPer1kUsd: 0.0025,
		baseLatencyMs: 700,
		tokensPerMinute: 85000,
		quality: 0.71,
		baseFailureRate: 0.16,
	},
}

export const defaultToolProfiles: Record<string, ToolProfile> = {
	github: {
		name: 'github',
		reliability: 0.97,
		avgLatencyMs: 900,
		costPerCallUsd: 0.002,
	},
	docs: {
		name: 'docs',
		reliability: 0.95,
		avgLatencyMs: 1200,
		costPerCallUsd: 0.001,
	},
	browser: {
		name: 'browser',
		reliability: 0.92,
		avgLatencyMs: 1800,
		costPerCallUsd: 0.002,
	},
	search: {
		name: 'search',
		reliability: 0.91,
		avgLatencyMs: 1600,
		costPerCallUsd: 0.0015,
	},
}

export const complexityMultiplier = {
	simple: 1,
	medium: 1.45,
	complex: 2.2,
} as const

export const coordinationFactors = {
	planner_worker: {
		overhead: 1.05,
		quality: 1.06,
	},
	peer_mesh: {
		overhead: 1.12,
		quality: 1.03,
	},
	queue_based: {
		overhead: 1.08,
		quality: 0.99,
	},
	supervisor_tree: {
		overhead: 1.15,
		quality: 1.08,
	},
} as const

export const reasoningFactors = {
	low: {
		speed: 1.2,
		quality: 0.94,
	},
	medium: {
		speed: 1,
		quality: 1,
	},
	high: {
		speed: 0.82,
		quality: 1.08,
	},
} as const
