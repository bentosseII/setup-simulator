import type { SimulationRange } from '@/lib/types'

export const clamp = (value: number, min: number, max: number): number => {
	if (value < min) {
		return min
	}
	if (value > max) {
		return max
	}
	return value
}

export const mean = (values: number[]): number => {
	if (values.length === 0) {
		return 0
	}
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

export const quantile = (values: number[], q: number): number => {
	if (values.length === 0) {
		return 0
	}
	const sorted = [...values].sort((a, b) => a - b)
	const index = (sorted.length - 1) * q
	const low = Math.floor(index)
	const high = Math.ceil(index)
	if (low === high) {
		return sorted[low]
	}
	const weight = index - low
	return sorted[low] * (1 - weight) + sorted[high] * weight
}

export const makeRange = (values: number[]): SimulationRange => {
	return {
		p10: quantile(values, 0.1),
		p50: quantile(values, 0.5),
		p90: quantile(values, 0.9),
	}
}

export const toPct = (value: number): number => {
	return value * 100
}
