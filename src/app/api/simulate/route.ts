import { NextResponse } from 'next/server'

import { runSimulation } from '@/lib/service/simulator'

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const mode = body.mode === 'stress' ? 'stress' : 'deep'
		const result = runSimulation({
			input: body.input,
			mode,
			options: body.options,
		})
		return NextResponse.json({ result })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid simulation request'
		return NextResponse.json({ error: message }, { status: 400 })
	}
}
