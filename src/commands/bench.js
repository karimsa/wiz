/**
 * @file src/commands/bench.js
 * @copyright 2019-present Karim Alibhai. All rights reserved.
 */

import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'

import createDebug from 'debug'

import { readdir, stat } from '../fs'

const debug = createDebug('wiz')

async function findBenchFiles(dir, results) {
	for (const file of await readdir(dir)) {
		if (file === '__bench__') {
			const files = (await readdir(dir + '/__bench__')).map(file => {
				return dir + '/__bench__/' + file
			})
			results.push(...files)
		} else if (file === 'node_modules') {
			// do nothing
		} else if ((await stat(dir + '/' + file)).isDirectory()) {
			await findBenchFiles(dir + '/' + file, results)
		}
	}
}

export const benchFlags = {
	growth: {
		type: 'string',
		alias: 'g',
		default: 'magnitude',
		describe: 'Growth function to use for number of iterations',
	},

	serial: {
		type: 'boolean',
		alias: 's',
		default: false,
		describe: 'Forces serial execution of benchmarks',
	},

	profile: {
		type: 'boolean',
		alias: 'p',
		default: false,
		describe:
			'Enables the wiz profiler during benchmark runs (implies --serial)',
	},

	benchTime: {
		type: 'number',
		alias: 't',
		default: 1000,
		describe: 'Maximum time to let a benchmark run before ending the benchmark',
	},

	benchRuns: {
		type: 'number',
		alias: 'r',
		default: Infinity,
		describe: 'Maximum number of iterations to allow for a benchmark',
	},
}

export async function benchCommand(argv) {
	const benchFiles = []
	await findBenchFiles(path.join(process.cwd(), 'src'), benchFiles)
	debug(`List of benchmark files: %O`, benchFiles)

	const runProfiler = Boolean(argv.profile)
	const runSerially = Boolean(argv.serial || runProfiler)

	process.env.WIZ_BENCH = JSON.stringify({
		growthFn: argv.growth,
		maxRunTime: argv.benchTime,
		maxIterations: argv.benchRuns,
	})

	let targetShard = 0
	const numCPUs = os.cpus().length
	const fileShards = runSerially ? [[]] : [...new Array(numCPUs)].map(() => [])
	benchFiles.forEach(file => {
		fileShards[targetShard].push(file)

		if (++targetShard === fileShards.length) {
			targetShard = 0
		}
	})
	debug(
		`Sharded ${benchFiles.length} benchmark files across ${numCPUs} processes`,
	)

	const goals = []
	fileShards.forEach(shard => {
		if (shard.length) {
			goals.push(
				new Promise((resolve, reject) => {
					const args = ['-e', '"void 0"']

					shard.forEach(file => {
						args.unshift(file)
						args.unshift('--require')
					})

					if (runProfiler) {
						args.unshift(require.resolve('./register-profiler.dist.js'))
						args.unshift('--require')
					}

					debug(`Spawning benchmark process: %O`, {
						args,
					})
					const child = spawn(process.execPath, args, {
						stdio: 'inherit',
					})

					child.on('close', code => {
						if (code === 0) {
							resolve()
						} else {
							reject(new Error(`Process exited with status code: ${code}`))
						}
					})
				}),
			)
		}
	})

	await Promise.all(goals)
}
