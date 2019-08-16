// For documentation on benchmarks, please see: `src/commands/bench.js`

import createDebug from 'debug'
import * as ansi from 'ansi-escapes'
import * as microtime from 'microtime'

const TableUtils = require('cli-table/lib/utils')
TableUtils.truncate = str => str
const Table = require('cli-table')

const debug = createDebug('wiz')
let benchmarksScheduled = false
let onlyAcceptOnlys = false
let registeredBenchmarks = new Map()
let longestBenchmarkTitleLength = 0
let benchmarkRunningHasBegun = false

const cliTable = new Table({
	chars: {
		top: '',
		'top-mid': '',
		'top-left': '',
		'top-right': '',
		bottom: '',
		'bottom-mid': '',
		'bottom-left': '',
		'bottom-right': '',
		left: '',
		'left-mid': '',
		mid: '',
		'mid-mid': '',
		right: '',
		'right-mid': '',
		middle: ' ',
	},
	colAligns: ['left', 'right', 'right'],
})

const benchConfig = JSON.parse(process.env.WIZ_BENCH || '{}')

function appendTable(row) {
	cliTable.push(row)

	process.stdout.write('\r' + ansi.eraseEndLine)
	if (cliTable.length > 1) {
		process.stdout.write(ansi.cursorUp(cliTable.length - 1))
	}

	process.stdout.write(cliTable.toString() + '\n')
	cliTable.options.colWidths = []
}

function fibonacci(n) {
	if (n <= 2) {
		return 1
	}

	let a = 1
	let b = 1
	let c = a + b
	for (let i = 3; i < n; i++) {
		a = b
		b = c
		c = a + b
	}
	return c
}

function magnitude(n) {
	return 10 ** n
}

function ms(time) {
	if (time >= 1000 * 1000 * 60) {
		return {
			time: Math.round((time / (1000 * 1000 * 60)) * 10) / 10,
			unit: 'm',
		}
	} else if (time >= 1000 * 1000) {
		return {
			time: Math.round((time / (1000 * 1000)) * 10) / 10,
			unit: 's',
		}
	} else if (time >= 1000) {
		return {
			time: Math.round((time / 1000) * 10) / 10,
			unit: 'ms',
		}
	}
	return {
		time: Math.round(time * 10) / 10,
		unit: 'µs',
	}
}

function prettyNumber(num) {
	num = String(num)
	let string = ''
	let numDigits = 0

	for (let i = num.length - 1; i > -1; --i) {
		string = num[i] + string
		if (++numDigits % 3 === 0) {
			string = ' ' + string
		}
	}

	return string.trimLeft()
}

function isDefined(value) {
	return value !== undefined && value !== null
}

function loadBenchConfig() {
	const config = {
		growthFn: magnitude,
		benchTime: 1000 * 1000,
		minIterations: 1,
		maxIterations: Infinity,
	}

	if (config.growthFn === 'fibonacci') {
		config.growthFn = fibonacci
	}
	if (isDefined(benchConfig.benchTime)) {
		config.benchTime = benchConfig.benchTime
	}
	if (isDefined(benchConfig.minIterations)) {
		config.minIterations = benchConfig.minIterations
	}
	if (isDefined(benchConfig.maxIterations)) {
		config.maxIterations = benchConfig.maxIterations
	}

	debug(`Benchmark config loaded => %O`, config)
	return config
}

export async function runAllBenchmarks() {
	const {
		benchTime,
		minIterations,
		maxIterations,
		growthFn,
	} = loadBenchConfig()
	let allBenchmarksSucceeded = true
	benchmarkRunningHasBegun = true

	// sort so that like-named benchmarks are next to each other for easier
	// comparison
	const entries = Array.from(registeredBenchmarks.entries()).sort((a, b) => {
		return a[0] >= b[0] ? 1 : -1
	})

	for (const [title, handlers] of entries) {
		try {
			let startTime
			let endTime
			let avgDurationPerOp = 0
			let avgOpsPerSecond = 0
			let numTotalRuns = 0
			let numIterations = minIterations
			let runNumber = 1
			let numIterationsWasChecked
			let timerIsRunning = true

			const b = {
				N() {
					numIterationsWasChecked = true
					return numIterations
				},
				resetTimer() {
					startTime = microtime.now()
					timerIsRunning = true
					debug(`Timer reset to: ${startTime}`)
				},
				stopTimer() {
					if (!timerIsRunning) {
						throw new Error(`Timer stopped twice`)
					}
					endTime = microtime.now()
					timerIsRunning = false
					debug(`Timer stopped at: ${endTime} (+${endTime - startTime}µs)`)
				},
			}

			const fn = handlers.pop()
			let args = [b]

			process.stdout.write(`\r${ansi.eraseEndLine}preparing: ${title}`)
			for (let i = 0; i < handlers.length; i++) {
				args = await handlers[i](args)
			}

			while (true) {
				numIterationsWasChecked = false
				process.stdout.write(
					`\r${ansi.eraseEndLine}running: ${title} (N = ${prettyNumber(
						numIterations,
					)})`,
				)
				b.resetTimer()
				await fn.apply(global, args)
				if (timerIsRunning) {
					b.stopTimer()
				}

				if (!numIterationsWasChecked) {
					throw new Error(
						`Benchmark '${title}' ran without calling b.N() - please see documentation`,
					)
				}

				const duration = endTime - startTime
				process.stderr.write('\r')
				debug(`${title} completed with N = ${numIterations} in ${duration}`)

				avgDurationPerOp += duration / numIterations
				if (duration > 0) {
					avgOpsPerSecond += (1000 * 1000) / (duration / numIterations)
				}
				numTotalRuns++

				if (duration >= benchTime || numIterations >= maxIterations) {
					debug(
						`${title} benchmark concluded (duration: ${duration}; iterations: ${numIterations}; config: %O)`,
						{
							benchTime,
							maxIterations,
							growthFn,
						},
					)
					break
				}

				numIterations = growthFn(++runNumber)
			}

			const { time, unit } = ms(avgDurationPerOp / numTotalRuns)
			appendTable([
				'\t' + title,
				prettyNumber(Math.floor(avgOpsPerSecond / numTotalRuns)) + ' ops/s',
				`${time} ${unit}/op`,
			])
		} catch (error) {
			allBenchmarksSucceeded = false
			console.error(
				`\r${ansi.eraseEndLine}\t${title}\tFailed with: ${String(error.stack)
					.split('\n')
					.map((line, index) => {
						if (index === 0) {
							return line
						}
						return '\t' + line
					})
					.join('\n')}`,
			)
		}
	}

	if (!allBenchmarksSucceeded) {
		process.exit(1)
	}
}

function addBenchmark(title, handlers) {
	if (benchmarkRunningHasBegun) {
		throw new Error(
			`Benchmark "${title}" registered after execution has already begun`,
		)
	}
	if (registeredBenchmarks.has(title)) {
		throw new Error(`Duplicate benchmark registered with title: '${title}'`)
	}
	longestBenchmarkTitleLength = Math.max(
		longestBenchmarkTitleLength,
		title.length,
	)
	registeredBenchmarks.set(title, handlers)
}

/**
 * This function registers benchmarks to the benchmark runner. For most basic use,
 * pass a string title describing the benchmark and a handler to run the benchmark.
 *
 * Benchmark titles should be unique across your codebase. This is verified by the
 * benchmark registration and the process will fail if you use a non-unique title.
 *
 * **Advanced: Using currying**
 *
 * The benchmark function also supports currying handlers to perform custom setup.
 * You can think of this as synonymous to `beforeEach()` in mocha. The way that
 * this works is that functions will be executed in the order that they are passed
 * in order to create a set of arguments that should be passed to the final handler
 * upon each invocation of the benchmark. The `b` object is never re-instantiated, but
 * the values returned by `b.N()` will change and should not be cached by setup
 * handlers.
 *
 * ###### Example
 *
 * ```javascript
 * import { benchmark } from '@karimsa/wiz/bench'
 *
 * import { createApi } from '../__tests__/helpers'
 *
 * async function setup(b) {
 * 		const api = await createApi({ version: 'v1' })
 * 		await api.setupUsers(10)
 *
 * 		return {
 * 			b,
 * 			api,
 * 		}
 * }
 *
 * benchmark('my custom benchmark', setup, async ({ b, api }) => {
 * 		// b.resetTimer() is unnecessary here since the execution
 * 		// time of 'setup()' is completely ignored by the runner
 *
 * 		for (let i = 0; i < b.N(); ++i) {
 * 			await api.addRecord({ i })
 * 		}
 * })
 * ```
 *
 * @type function
 */
export const benchmark = Object.assign(
	function(title, ...handlers) {
		if (!onlyAcceptOnlys) {
			addBenchmark(title, handlers)
		}
		if (!benchmarksScheduled) {
			benchmarksScheduled = true
			process.nextTick(runAllBenchmarks)
		}
	},
	{
		only(title, ...handlers) {
			if (!onlyAcceptOnlys) {
				onlyAcceptOnlys = true
				registeredBenchmarks = new Map()
				longestBenchmarkTitleLength = 0
			}
			addBenchmark(title, handlers)
			if (!benchmarksScheduled) {
				benchmarksScheduled = true
				process.nextTick(runAllBenchmarks)
			}
		},
	},
)
