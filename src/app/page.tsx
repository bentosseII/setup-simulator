'use client'

import { useMemo, useState } from 'react'

import type { ComparisonResult, SimulationMode, SimulationResult } from '@/lib/types'

const samplePrompt =
	'Simulate 3 coding agents and 1 research agent, shared memory, daily heartbeat, working on a Next.js app with GitHub + docs tools, medium reasoning, budget cap $100/day.'

const sampleBaselineJson = `{
  "name": "Baseline",
  "agents": [
    {
      "id": "coding",
      "role": "coding",
      "count": 3,
      "provider": "openai",
      "model": "gpt-4.1",
      "reasoning": "medium",
      "toolPermissions": ["github", "docs"],
      "expectedToolCallsPerTask": 2,
      "avgInputTokens": 2200,
      "avgOutputTokens": 1400
    },
    {
      "id": "research",
      "role": "research",
      "count": 1,
      "provider": "openai",
      "model": "gpt-4.1-mini",
      "reasoning": "medium",
      "toolPermissions": ["docs", "search"],
      "expectedToolCallsPerTask": 3,
      "avgInputTokens": 1600,
      "avgOutputTokens": 1000
    }
  ],
  "tools": [
    { "name": "github", "reliability": 0.97, "avgLatencyMs": 900, "costPerCallUsd": 0.002 },
    { "name": "docs", "reliability": 0.95, "avgLatencyMs": 1200, "costPerCallUsd": 0.001 },
    { "name": "search", "reliability": 0.91, "avgLatencyMs": 1600, "costPerCallUsd": 0.0015 }
  ],
  "tasks": [
    {
      "name": "nextjs_delivery",
      "arrivalRatePerHour": 1.6,
      "complexity": "medium",
      "requiredRoles": ["coding", "research"],
      "slaMs": 14000
    }
  ],
  "coordination": { "strategy": "planner_worker", "handoffOverheadMs": 900, "maxQueueDepth": 50 },
  "memory": { "strategy": "shared_store", "retrievalCadencePerTask": 1.2, "retrievalFailureRate": 0.08, "contextWindowTokens": 16000 },
  "governance": { "budgetDailyUsd": 100, "tokenLimitPerTask": 30000, "maxRetries": 2, "escalationPolicy": "manual" },
  "heartbeats": { "frequency": "daily", "overheadMinutes": 5 },
  "workload": { "hoursPerDay": 8, "daysPerWeek": 5 }
}`

const sampleVariantJson = sampleBaselineJson
	.replace('"count": 3', '"count": 2')
	.replace('"model": "gpt-4.1"', '"model": "gpt-4.1-mini"')

const fmtUsd = (value: number): string => `$${value.toFixed(2)}`
const fmtPct = (value: number): string => `${(value * 100).toFixed(1)}%`
const fmtMs = (value: number): string => `${(value / 1000).toFixed(1)}s`

export default function Home() {
	const [input, setInput] = useState(samplePrompt)
	const [mode, setMode] = useState<SimulationMode>('quick')
	const [calibrationEnabled, setCalibrationEnabled] = useState(true)
	const [calibrationRuns, setCalibrationRuns] = useState('3')
	const [result, setResult] = useState<SimulationResult | null>(null)
	const [compareBaseline, setCompareBaseline] = useState(sampleBaselineJson)
	const [compareVariant, setCompareVariant] = useState(sampleVariantJson)
	const [compareMode, setCompareMode] = useState<'quick' | 'deep' | 'stress'>('quick')
	const [comparison, setComparison] = useState<ComparisonResult | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const endpoint = useMemo(() => (mode === 'quick' ? '/api/estimate' : '/api/simulate'), [mode])
	const parsedCalibrationRuns = useMemo(() => {
		const value = Number(calibrationRuns)
		if (!Number.isFinite(value)) {
			return 3
		}
		return Math.max(1, Math.min(10, Math.round(value)))
	}, [calibrationRuns])

	const run = async () => {
		setLoading(true)
		setError(null)
		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					input,
					mode,
					options:
						mode === 'quick'
							? undefined
							: {
									calibrationRuns: parsedCalibrationRuns,
									disableCalibration: !calibrationEnabled,
								},
				}),
			})
			const payload = (await response.json()) as { result?: SimulationResult; error?: string }
			if (!response.ok || !payload.result) {
				throw new Error(payload.error ?? 'Simulation failed')
			}
			setResult(payload.result)
		} catch (runError) {
			setError(runError instanceof Error ? runError.message : 'Simulation failed')
		} finally {
			setLoading(false)
		}
	}

	const runCompare = async () => {
		setLoading(true)
		setError(null)
		try {
			const response = await fetch('/api/compare', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					mode: compareMode,
					baseline: compareBaseline,
					variant: compareVariant,
					options:
						compareMode === 'quick'
							? undefined
							: {
									calibrationRuns: parsedCalibrationRuns,
									disableCalibration: !calibrationEnabled,
								},
				}),
			})
			const payload = (await response.json()) as { result?: ComparisonResult; error?: string }
			if (!response.ok || !payload.result) {
				throw new Error(payload.error ?? 'Comparison failed')
			}
			setComparison(payload.result)
		} catch (compareError) {
			setError(compareError instanceof Error ? compareError.message : 'Comparison failed')
		} finally {
			setLoading(false)
		}
	}

	const runOptimizedVariant = async () => {
		setLoading(true)
		setError(null)
		try {
			const response = await fetch('/api/optimize', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					input,
					mode,
					options:
						mode === 'quick'
							? undefined
							: {
									calibrationRuns: parsedCalibrationRuns,
									disableCalibration: !calibrationEnabled,
								},
				}),
			})
			const payload = (await response.json()) as { result?: ComparisonResult; error?: string }
			if (!response.ok || !payload.result) {
				throw new Error(payload.error ?? 'Optimization simulation failed')
			}
			setComparison(payload.result)
		} catch (optimizeError) {
			setError(optimizeError instanceof Error ? optimizeError.message : 'Optimization simulation failed')
		} finally {
			setLoading(false)
		}
	}

	return (
		<main className='page'>
			<section className='hero'>
				<p className='eyebrow'>Agent Setup Simulator</p>
				<h1>Flight simulator for agent architectures</h1>
				<p>
					Describe your setup. get forecasted cost, throughput, latency, failure modes, and
					optimization moves before you build.
				</p>
			</section>

			<section className='panel'>
				<div className='panelHeader'>
					<h2>Run simulation</h2>
					<div className='controls'>
						<select value={mode} onChange={(event) => setMode(event.target.value as SimulationMode)}>
							<option value='quick'>Quick estimate</option>
							<option value='deep'>Deep simulation</option>
							<option value='stress'>Stress test</option>
						</select>
						<button onClick={run} disabled={loading}>
							{loading ? 'Running…' : 'Simulate setup'}
						</button>
					</div>
				</div>
				<textarea value={input} onChange={(event) => setInput(event.target.value)} rows={7} />
				{mode !== 'quick' ? (
					<div className='inlineControls'>
						<label>
							<input
								type='checkbox'
								checked={calibrationEnabled}
								onChange={(event) => setCalibrationEnabled(event.target.checked)}
							/>
							<span>Enable calibration</span>
						</label>
						<label>
							<span>Calibration runs</span>
							<input
								type='number'
								min={1}
								max={10}
								value={calibrationRuns}
								onChange={(event) => setCalibrationRuns(event.target.value)}
							/>
						</label>
					</div>
				) : null}
				{error ? <p className='error'>{error}</p> : null}
			</section>

			{result ? (
				<section className='dashboard'>
					<article className='card'>
						<h3>Cost panel</h3>
						<p className='metric'>{fmtUsd(result.cost.dayUsd.p50)} / day</p>
						<p>
							Range: {fmtUsd(result.cost.dayUsd.p10)} - {fmtUsd(result.cost.dayUsd.p90)}
						</p>
					</article>
					<article className='card'>
						<h3>Performance panel</h3>
						<p className='metric'>{fmtPct(result.performance.completionRate.p50)} completion</p>
						<p>
							Throughput: {result.performance.throughputPerHour.p50.toFixed(2)} tasks/hr
						</p>
						<p>p90 latency: {fmtMs(result.performance.latencyMs.p90)}</p>
					</article>
					<article className='card'>
						<h3>Risk panel</h3>
						<ul>
							{result.risks.map((risk) => (
								<li key={risk.id}>
									<strong>{risk.label}</strong>
									<span>
										L {(risk.likelihood * 100).toFixed(0)} / S {(risk.severity * 100).toFixed(0)}
									</span>
								</li>
							))}
						</ul>
					</article>
					<article className='card'>
						<h3>Bottleneck map</h3>
						<ul>
							{result.bottlenecks.slice(0, 4).map((bottleneck) => (
								<li key={bottleneck.target}>
									<strong>{bottleneck.target}</strong>
									<span>{(bottleneck.utilization * 100).toFixed(0)}% util</span>
								</li>
							))}
						</ul>
					</article>
					<article className='card wide'>
						<h3>Optimization panel</h3>
						<ol>
							{result.recommendations.map((recommendation) => (
								<li key={recommendation.id}>
									<strong>{recommendation.title}</strong>
									<p>{recommendation.rationale}</p>
									<span>
										Cost {recommendation.expectedCostDeltaPct.toFixed(1)}% | Completion +
										{recommendation.expectedCompletionDeltaPts.toFixed(1)} pts
									</span>
								</li>
							))}
						</ol>
						<button onClick={runOptimizedVariant} disabled={loading}>
							Simulate top recommended variant
						</button>
					</article>
					<article className='card wide'>
						<h3>Confidence panel</h3>
						<p className='metric'>{(result.confidence.score * 100).toFixed(0)} / 100</p>
						<p>Interval width: {(result.confidence.intervalWidth * 100).toFixed(1)} pts</p>
						{result.raw.calibration ? (
							<p>
								Calibration coverage {(result.raw.calibration.coverage * 100).toFixed(0)}% from{' '}
								{result.raw.calibration.matchedRecords} records
							</p>
						) : null}
						<ul>
							{result.confidence.assumptions.map((assumption) => (
								<li key={assumption}>{assumption}</li>
							))}
						</ul>
					</article>
				</section>
			) : null}

			<section className='panel comparePanel'>
				<div className='panelHeader'>
					<h2>Compare scenarios</h2>
					<div className='controls'>
						<select
							value={compareMode}
							onChange={(event) => setCompareMode(event.target.value as 'quick' | 'deep' | 'stress')}
						>
							<option value='quick'>Quick</option>
							<option value='deep'>Deep</option>
							<option value='stress'>Stress</option>
						</select>
						<button onClick={runCompare} disabled={loading}>
							{loading ? 'Comparing…' : 'Compare setups'}
						</button>
					</div>
				</div>
				<div className='compareGrid'>
					<textarea
						rows={14}
						value={compareBaseline}
						onChange={(event) => setCompareBaseline(event.target.value)}
					/>
					<textarea
						rows={14}
						value={compareVariant}
						onChange={(event) => setCompareVariant(event.target.value)}
					/>
				</div>

				{comparison ? (
					<div className='compareResult'>
						<p className='metric'>Winner: {comparison.winner}</p>
						<p>{comparison.narrative}</p>
						<div>
							<span>Cost delta: {comparison.deltas.costDayP50Pct.toFixed(1)}%</span>
							<span>Completion delta: {comparison.deltas.completionRatePts.toFixed(1)} pts</span>
							<span>Latency delta: {comparison.deltas.latencyP50Pct.toFixed(1)}%</span>
							<span>Throughput delta: {comparison.deltas.throughputP50Pct.toFixed(1)}%</span>
						</div>
					</div>
				) : null}
			</section>
		</main>
	)
}
