import type { ComparisonResult, SimulationResult } from '@/lib/types'

const pctDelta = (baseline: number, variant: number): number => {
	if (baseline === 0) {
		return 0
	}
	return ((variant - baseline) / baseline) * 100
}

export const compareResults = (
	baseline: SimulationResult,
	variant: SimulationResult,
): ComparisonResult => {
	const costDayP50Pct = pctDelta(baseline.cost.dayUsd.p50, variant.cost.dayUsd.p50)
	const completionRatePts = (variant.performance.completionRate.p50 - baseline.performance.completionRate.p50) * 100
	const latencyP50Pct = pctDelta(baseline.performance.latencyMs.p50, variant.performance.latencyMs.p50)
	const throughputP50Pct = pctDelta(
		baseline.performance.throughputPerHour.p50,
		variant.performance.throughputPerHour.p50,
	)

	let variantScore = 0
	if (costDayP50Pct < 0) {
		variantScore += 1
	}
	if (completionRatePts > 0) {
		variantScore += 1
	}
	if (latencyP50Pct < 0) {
		variantScore += 1
	}
	if (throughputP50Pct > 0) {
		variantScore += 1
	}

	const winner = variantScore >= 3 ? 'variant' : variantScore <= 1 ? 'baseline' : 'tie'

	const narrative =
		winner === 'variant'
			? 'Variant outperforms baseline across key cost/performance metrics.'
			: winner === 'baseline'
				? 'Baseline remains stronger under selected objective mix.'
				: 'Tradeoffs are balanced; choose based on budget vs reliability preferences.'

	return {
		baseline,
		variant,
		deltas: {
			costDayP50Pct,
			completionRatePts,
			latencyP50Pct,
			throughputP50Pct,
		},
		winner,
		narrative,
	}
}
