export interface RNG {
	next: () => number
	nextBetween: (min: number, max: number) => number
	nextNormal: (mean: number, stddev: number) => number
	pick: <T>(items: T[]) => T
}

const clampUnit = (value: number): number => {
	if (value < 0) {
		return 0
	}
	if (value > 1) {
		return 1
	}
	return value
}

const mulberry32 = (seed: number) => {
	let state = seed >>> 0
	return () => {
		state += 0x6d2b79f5
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export const createRng = (seed = 42): RNG => {
	const next = mulberry32(seed)

	return {
		next,
		nextBetween: (min, max) => min + (max - min) * next(),
		nextNormal: (mean, stddev) => {
			const u1 = Math.max(next(), 1e-8)
			const u2 = Math.max(next(), 1e-8)
			const mag = Math.sqrt(-2 * Math.log(u1))
			const z0 = mag * Math.cos(2 * Math.PI * u2)
			return mean + z0 * stddev
		},
		pick: (items) => {
			const index = Math.floor(next() * items.length)
			return items[Math.min(index, items.length - 1)]
		},
	}
}

export const samplePoisson = (rng: RNG, lambda: number): number => {
	const limit = Math.exp(-lambda)
	let k = 0
	let p = 1

	while (p > limit) {
		k += 1
		p *= rng.next()
	}

	return Math.max(k - 1, 0)
}

export const chance = (rng: RNG, probability: number): boolean => {
	return rng.next() < clampUnit(probability)
}

export const clamp01 = clampUnit
