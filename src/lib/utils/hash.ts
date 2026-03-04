export const hashString = (value: string): string => {
	let hash = 2166136261
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	return `fnv-${(hash >>> 0).toString(16)}`
}

export const stableStringify = (value: unknown): string => {
	return JSON.stringify(value, (_, input) => {
		if (input && typeof input === 'object' && !Array.isArray(input)) {
			return Object.keys(input)
				.sort()
				.reduce<Record<string, unknown>>((acc, key) => {
					acc[key] = (input as Record<string, unknown>)[key]
					return acc
				}, {})
		}
		return input
	})
}
