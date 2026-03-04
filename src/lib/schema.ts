import { z } from 'zod'

import type { SetupConfig } from '@/lib/types'

const reasoningSchema = z.enum(['low', 'medium', 'high'])

const agentRoleSchema = z.object({
	id: z.string().min(1),
	role: z.string().min(1),
	count: z.number().int().min(1).default(1),
	provider: z.string().min(1).default('openai'),
	model: z.string().min(1).default('gpt-4.1-mini'),
	reasoning: reasoningSchema.default('medium'),
	toolPermissions: z.array(z.string().min(1)).default([]),
	expectedToolCallsPerTask: z.number().min(0).default(1),
	avgInputTokens: z.number().int().min(50).default(1400),
	avgOutputTokens: z.number().int().min(50).default(900),
	completionProbabilityOverride: z.number().min(0).max(1).optional(),
})

const toolSchema = z.object({
	name: z.string().min(1),
	reliability: z.number().min(0).max(1).default(0.95),
	avgLatencyMs: z.number().min(0).default(1200),
	costPerCallUsd: z.number().min(0).default(0),
})

const taskClassSchema = z.object({
	name: z.string().min(1),
	arrivalRatePerHour: z.number().min(0.05).default(1),
	complexity: z.enum(['simple', 'medium', 'complex']).default('medium'),
	requiredRoles: z.array(z.string().min(1)).min(1),
	slaMs: z.number().int().positive().optional(),
})

const coordinationSchema = z.object({
	strategy: z
		.enum(['planner_worker', 'peer_mesh', 'queue_based', 'supervisor_tree'])
		.default('planner_worker'),
	handoffOverheadMs: z.number().min(0).default(800),
	maxQueueDepth: z.number().int().min(1).default(50),
})

const memorySchema = z.object({
	strategy: z.enum(['shared_store', 'private_contexts', 'hybrid']).default('shared_store'),
	retrievalCadencePerTask: z.number().min(0).default(1),
	retrievalFailureRate: z.number().min(0).max(1).default(0.08),
	contextWindowTokens: z.number().int().positive().default(16000),
})

const governanceSchema = z.object({
	budgetDailyUsd: z.number().min(1).default(100),
	tokenLimitPerTask: z.number().int().positive().default(30000),
	maxRetries: z.number().int().min(0).max(8).default(2),
	escalationPolicy: z.enum(['none', 'manual', 'auto']).default('manual'),
})

const heartbeatSchema = z.object({
	frequency: z.enum(['hourly', 'daily', 'per_task']).default('daily'),
	overheadMinutes: z.number().min(0).default(5),
})

const workloadSchema = z.object({
	hoursPerDay: z.number().min(1).max(24).default(8),
	daysPerWeek: z.number().min(1).max(7).default(5),
})

export const setupConfigSchema = z
	.object({
		name: z.string().min(1).default('Untitled setup'),
		agents: z.array(agentRoleSchema).min(1),
		tools: z.array(toolSchema).default([]),
		tasks: z.array(taskClassSchema).min(1),
		coordination: coordinationSchema.default({
			strategy: 'planner_worker',
			handoffOverheadMs: 800,
			maxQueueDepth: 50,
		}),
		memory: memorySchema.default({
			strategy: 'shared_store',
			retrievalCadencePerTask: 1,
			retrievalFailureRate: 0.08,
			contextWindowTokens: 16000,
		}),
		governance: governanceSchema.default({
			budgetDailyUsd: 100,
			tokenLimitPerTask: 30000,
			maxRetries: 2,
			escalationPolicy: 'manual',
		}),
		heartbeats: heartbeatSchema.default({
			frequency: 'daily',
			overheadMinutes: 5,
		}),
		workload: workloadSchema.default({
			hoursPerDay: 8,
			daysPerWeek: 5,
		}),
	})
	.superRefine((value, ctx) => {
		const roleIds = new Set(value.agents.map((agent) => agent.id))
		for (const task of value.tasks) {
			for (const role of task.requiredRoles) {
				if (!roleIds.has(role)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `Task "${task.name}" references missing role "${role}"`,
					})
				}
			}
		}
	})

export type SetupConfigInput = z.input<typeof setupConfigSchema>

export const parseSetupConfig = (input: unknown): SetupConfig => {
	return setupConfigSchema.parse(input)
}
