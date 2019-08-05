/**
 * @file src/bench.js
 * @copyright 2019-present Karim Alibhai. All rights reserved.
 */

import * as ansi from 'ansi-escapes'

let onlyAcceptOnlys = false
let registeredBenchmarks = new Map()
let benchmarksScheduled = false
let longestBenchmarkTitleLength = 0

const benchConfig = JSON.parse(process.env.WIZ_BENCH || '{}')

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
	if (time >= 1000 * 60) {
		return {
			time: Math.round((time / (1000 * 60)) * 10) / 10,
			unit: 'm',
		}
	} else if (time >= 1000) {
		return {
			time: Math.round((time / 1000) * 10) / 10,
			unit: 's',
		}
	}
	return {
		time: Math.round(time * 10) / 10,
		unit: 'ms',
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

async function runAllBenchmarks() {
	const { maxRunTime, maxIterations } = benchConfig
	const growthFn = benchConfig.growthFn === 'fibonacci' ? fibonacci : magnitude
	let allBenchmarksSucceeded = true

	for (const [title, handlers] of registeredBenchmarks.entries()) {
		try {
			let startTime
			let avgDurationPerOp = 0
			let numTotalRuns = 0
			let numIterations = 1
			let runNumber = 1
			let numIterationsWasChecked

			const b = {
				N() {
					numIterationsWasChecked = true
					return numIterations
				},
				resetTimer() {
					startTime = Date.now()
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

				if (!numIterationsWasChecked) {
					throw new Error(
						`Benchmark '${title}' ran without calling b.N() - please see documentation`,
					)
				}

				const duration = Date.now() - startTime

				avgDurationPerOp += duration / numIterations
				numTotalRuns++

				if (duration >= maxRunTime || numIterations >= maxIterations) {
					break
				}

				numIterations = growthFn(++runNumber)
			}

			const lastDuration = (Date.now() - startTime) / 1000
			const { time, unit } = ms(avgDurationPerOp / numTotalRuns)
			const postTitleSpacing = ' '.repeat(
				longestBenchmarkTitleLength - title.length + 4,
			)
			console.log(
				`\r${ansi.eraseEndLine}\t${title}${postTitleSpacing}${prettyNumber(
					Math.floor(numIterations / lastDuration),
				)} ops/s\t${time} ${unit}/op`,
			)
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
	if (registeredBenchmarks.has(title)) {
		throw new Error(`Duplicate benchmark registered with title: '${title}'`)
	}
	registeredBenchmarks.set(title, handlers)
}

export const benchmark = Object.assign(
	function(title, ...handlers) {
		if (!onlyAcceptOnlys) {
			addBenchmark(title, handlers)
			if (title.length > longestBenchmarkTitleLength) {
				longestBenchmarkTitleLength = title.length
			}
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
			if (title.length > longestBenchmarkTitleLength) {
				longestBenchmarkTitleLength = title.length
			}
			if (!benchmarksScheduled) {
				benchmarksScheduled = true
				process.nextTick(runAllBenchmarks)
			}
		},
	},
)
