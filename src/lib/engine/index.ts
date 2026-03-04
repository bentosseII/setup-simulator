import { runDeepSimulation } from '@/lib/engine/deep-simulation'
import { compareResults } from '@/lib/engine/compare'
import { runQuickEstimate } from '@/lib/engine/quick-estimate'
import { buildRecommendations } from '@/lib/engine/recommendations'
import type {
	ComparisonResult,
	SetupConfig,
	SimulationMode,
	SimulationOptions,
	SimulationResult,
} from '@/lib/types'

export const simulateSetup = (
	config: SetupConfig,
	mode: SimulationMode,
	options: SimulationOptions = {},
): SimulationResult => {
	const base =
		mode === 'quick' ? runQuickEstimate(config) : runDeepSimulation(config, mode, options)

	const recommendations = buildRecommendations(config, base)

	return {
		...base,
		recommendations,
	}
}

export const compareSetups = (
	baseline: SetupConfig,
	variant: SetupConfig,
	mode: SimulationMode,
	options: SimulationOptions = {},
): ComparisonResult => {
	const baselineResult = simulateSetup(baseline, mode, options)
	const variantResult = simulateSetup(variant, mode, options)
	return compareResults(baselineResult, variantResult)
}
