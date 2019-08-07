import Table from 'cli-table'

export function cliReporter(events, { minThreshold }) {
	const table = new Table({
		head: ['type', 'file', 'duration', '# calls', 'impact'],
	})

	events.forEach(event => {
		const impact = event.duration / event.ticks

		if (impact > minThreshold) {
			table.push([
				event.type,
				event.fileID,
				event.duration,
				event.ticks,
				impact,
			])
		}
	})

	console.log(table.toString())
}
