/**
 * @file src/reporter.js
 * @copyright 2019-present Karim Alibhai. All rights reserved.
 */

import Table from 'cli-table'

export function cliReporter(events) {
	const table = new Table({
		head: ['file', 'duration', '# calls', 'impact'],
	})

	events.forEach(event => {
		event.impact = event.duration / event.ticks
	})

	events
		.sort((a, b) => {
			return b.impact - a.impact
		})
		.forEach(event => {
			table.push([event.fileID, event.duration, event.ticks, event.impact])
		})

	console.log(table.toString())
}
