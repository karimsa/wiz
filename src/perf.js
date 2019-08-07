import { performance, PerformanceObserver } from 'perf_hooks'

import Table from 'cli-table'
import ms from 'ms'
import { v4 as uuid } from 'uuid'

const events = new Map()
const startTime = Date.now()

export async function measure(eventName, fn) {
	const id = uuid()
	performance.mark(`start-${eventName}-${id}`)
	const returnValue = await fn()
	performance.mark(`end-${eventName}-${id}`)
	performance.measure(
		eventName,
		`start-${eventName}-${id}`,
		`end-${eventName}-${id}`,
	)
	return returnValue
}

export function observeEntries(entries) {
	for (const { name, duration } of entries) {
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
}

export function enableHooks() {
	new PerformanceObserver(items => {
		observeEntries(items.getEntries())
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
