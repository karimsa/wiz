import * as path from 'path'

import createDebug from 'debug'

import { injectProfiler } from '../profiler'

const debug = createDebug('wiz')

export function profileCommand(argv) {
	if (argv._.length !== 2) {
		console.error(`Please provide one entrypoint`)
		process.exit(1)
	}

	const entrypoint = argv._[1]

	return new Promise(resolveExit => {
		injectProfiler({
			reporter: argv.reporter,
			minThreshold: argv.minThreshold,
			ignoreNodeModules: argv.ignoreNodeModules,
			absolutePaths: argv.absolutePaths,
			onExit: resolveExit,
		})

		// avoid dropping require
		debug(`Loading: ${entrypoint}`)
		require(path.resolve(process.cwd(), entrypoint))
	})
}
