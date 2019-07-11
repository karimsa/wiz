#!/usr/bin/env node

// ...

import { PerformanceObserver } from 'perf_hooks'

import meow from 'meow'
import Table from 'cli-table'
import ms from 'ms'

import { lintCommand } from './commands/lint'

const argv = meow(
	`
    Usage
        $ prop [command] [options]
    
    Commands
        lint    Check all your source files for code quality
        build   Builds the current project into a target
        test    Run tests for the current project
        bench   Run benchmarks for the current project
    
    Options:
        -h, --help  	Print this help message
		-v, --version   Print the current version of prop
		-d, --debug		Enable debug mode
`,
	{
		flags: {
			help: {
				type: 'boolean',
				alias: 'h',
			},
			version: {
				type: 'boolean',
				alias: 'v',
			},
			debug: {
				type: 'boolean',
				alias: 'd',
			},
		},
	},
)

if (argv.flags.debug) {
	const events = new Map()
	const startTime = Date.now()

	new PerformanceObserver(items => {
		for (const { name, duration } of items.getEntries()) {
			if (events.has(name)) {
				const event = events.get(name)
				event.total += duration
				event.ticks++
			} else {
				events.set(name, {
					total: duration,
					ticks: 1,
				})
			}
		}
	}).observe({ entryTypes: ['measure'] })

	process.on('beforeExit', () => {
		const totalDuration = Date.now() - startTime
		const table = new Table({
			head: ['event', 'avg', '%', 'total'],
		})

		Array.from(events.entries())
			.map(([event, details]) => ({
				event,
				avg: ms(Math.round(details.total / details.ticks)),
				'%': Math.round((details.total / totalDuration) * 1e2),
				total: ms(Math.round(details.total)),
			}))
			.sort((a, b) => b['%'] - a['%'])
			.forEach(row => {
				table.push(Object.values(row))
			})

		console.log(table.toString())
	})
}

async function main() {
	if (argv.flags.help || argv.input.length === 0) {
		argv.showHelp()
	} else if (argv.flags.version) {
		argv.showVersion()
	}

	console.time(argv.input[0])
	switch (argv.input[0]) {
		case 'lint':
			await lintCommand(argv)
			break

		default:
			console.error(`Unrecognized command: '${argv.input[0]}'`)
			argv.showHelp()
	}
	console.timeEnd(argv.input[0])
}

main().catch(err => {
	console.error(err.stack)
	process.exit(1)
})
