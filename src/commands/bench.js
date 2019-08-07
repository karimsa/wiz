/**
 * @file src/commands/bench.js
 * @copyright 2019-present Karim Alibhai. All rights reserved.
 */

import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'

import createDebug from 'debug'

import { findSourceFiles } from '../glob'

const debug = createDebug('wiz')

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
	const runProfiler = Boolean(argv.profile)
	const runSerially = Boolean(argv.serial || runProfiler)

	process.env.WIZ_BENCH = JSON.stringify({
		growthFn: argv.growth,
		maxRunTime: argv.benchTime,
		maxIterations: argv.benchRuns,
	})

	let targetShard = 0
	let numBenchFiles = 0
	const numCPUs = os.cpus().length
	const fileShards = runSerially ? [[]] : [...new Array(numCPUs)].map(() => [])

	for await (const { file, type } of findSourceFiles({
		directory: path.join(process.cwd(), 'src'),
		cache: {},
	})) {
		if (type === 'benchmark') {
			++numBenchFiles
			fileShards[targetShard].push(file)

			if (++targetShard === fileShards.length) {
				targetShard = 0
			}
		}
	}
	debug(`Sharded ${numBenchFiles} benchmark files across ${numCPUs} processes`)

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
							reject(
								Object.assign(new Error(), {
									code: 'CHILD_PROCESS',
								}),
							)
						}
					})
				}),
			)
		}
	})

	try {
		await Promise.all(goals)
	} catch (error) {
		if (error.code !== 'CHILD_PROCESS') {
			throw error
		}

		console.error(`\nSome benchmarks failed.`)
		process.exit(1)
	}
}
