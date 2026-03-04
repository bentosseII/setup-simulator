import { describe, expect, it } from 'vitest'

import { runDeepSimulation } from '@/lib/engine/deep-simulation'
import { makeSetup } from '@/lib/test-fixtures'

describe('deep simulation engine', () => {
	it('produces deterministic output for fixed seed and iterations', () => {
		const setup = makeSetup()
		const a = runDeepSimulation(setup, 'deep', { seed: 99, iterations: 40 })
		const b = runDeepSimulation(setup, 'deep', { seed: 99, iterations: 40 })
		expect(a.cost.dayUsd.p50).toBeCloseTo(b.cost.dayUsd.p50, 5)
		expect(a.performance.completionRate.p50).toBeCloseTo(b.performance.completionRate.p50, 5)
		expect(a.performance.latencyMs.p50).toBeCloseTo(b.performance.latencyMs.p50, 4)
	})

	it('stress mode degrades completion rate relative to deep mode', () => {
		const setup = makeSetup()
		const deep = runDeepSimulation(setup, 'deep', { seed: 10, iterations: 60 })
		const stress = runDeepSimulation(setup, 'stress', { seed: 10, iterations: 60 })
		expect(stress.performance.completionRate.p50).toBeLessThanOrEqual(deep.performance.completionRate.p50)
	})

	it('applies optional reference calibration', () => {
		const setup = makeSetup()
		const calibrated = runDeepSimulation(setup, 'deep', { seed: 22, iterations: 50, calibrationRuns: 4 })
		const uncalibrated = runDeepSimulation(setup, 'deep', {
			seed: 22,
			iterations: 50,
			disableCalibration: true,
		})

		expect(calibrated.raw.calibration?.enabled).toBe(true)
		expect(calibrated.raw.calibration?.matchedRecords).toBeGreaterThan(0)
		expect(uncalibrated.raw.calibration?.enabled).toBe(false)
		expect(calibrated.confidence.score).toBeGreaterThanOrEqual(uncalibrated.confidence.score)
	})
})
