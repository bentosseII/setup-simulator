import { NextResponse } from 'next/server'

import { runOptimizedComparison } from '@/lib/service/simulator'

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const mode = body.mode === 'stress' ? 'stress' : body.mode === 'deep' ? 'deep' : 'quick'
		const result = runOptimizedComparison({
			input: body.input,
			mode,
			options: body.options,
		})
		return NextResponse.json({ result })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid optimization request'
		return NextResponse.json({ error: message }, { status: 400 })
	}
}
