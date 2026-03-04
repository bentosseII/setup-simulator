import type { Metadata } from 'next'
import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google'

import '@/app/globals.css'

const sans = Space_Grotesk({
	subsets: ['latin'],
	variable: '--font-sans',
})

const mono = IBM_Plex_Mono({
	subsets: ['latin'],
	weight: ['400', '500'],
	variable: '--font-mono',
})

export const metadata: Metadata = {
	title: 'Agent Setup Simulator',
	description: 'Flight simulator for agent architectures',
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang='en'>
			<body className={`${sans.variable} ${mono.variable}`}>{children}</body>
		</html>
	)
}
