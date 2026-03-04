import { NextResponse } from 'next/server'

import { runSimulation } from '@/lib/service/simulator'

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const result = runSimulation({
			input: body.input,
			mode: 'quick',
			options: body.options,
		})
		return NextResponse.json({ result })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid estimate request'
		return NextResponse.json({ error: message }, { status: 400 })
	}
}
