import * as path from 'path'
import { spawn } from 'child_process'

import createDebug from 'debug'

import { findSourceFiles } from '../glob'

const debug = createDebug('wiz')

/**
 * Writing benchmarks with `wiz` involves understanding a bit about how benchmarks are run. The benchmark
 * runner consists of two parts - a utility that is imported from `@karimsa/wiz/bench` and the benchmark CLI
 * that is invoked by calling `wiz bench`. Here's a sample benchmark:
 *
 * ```javascript
 * import { benchmark } from '@karimsa/wiz/bench'
 *
 * function fib(n) {
 * 		if (n < 2) {
 * 			return 1
 * 		}
 * 		return fib(n - 1) + fib(n - 2)
 * }
 *
 * benchmark('fib(10)', async b => {
 * 		for (let i = 0; i < b.N(); ++i) {
 * 			fib(10)
 * 		}
 * })
 * ```
 *
 * The `@karimsa/wiz/bench` import exposes a single function called `benchmark` which allows your script to
 * register benchmarks. This function takes two arguments: a title for the benchmark and a function to run the
 * benchmark. The function that runs the benchmark may be synchronous or it may be asynchronous in which case it
 * **must** return a promise.
 *
 * Your benchmark function will receive a single parameter: the `b` object. Which has the following methods:
 *
 *  * **resetTimer()**: Resets the benchmark timer. Useful for running after you do any expensive setup for your
 * benchmark.
 *  * **N()**: Returns the number of times you should execute the code you wish to mention.
 *
 * The benchmark runner calls each benchmark function multiple times. Each time, the number returned by `b.N()` will
 * be larger. For the duration of a single call to the benchmark function, the value will stay the same. The value
 * begins at 1 and keeps increasing until the benchmark function timer exceeds the duration of 1 second. Once it does,
 * the benchmark statistics like the number of operations per second and time per operation will be written to the
 * console.
 *
 * When imported into a node process, `@karimsa/wiz/bench` schedules the benchmark execution for the next tick of
 * the event loop. This means that you can run any benchmark file by simply using node (i.e.
 * `node src/__bench__/bench-my-benchmark.js`). However, when you run `wiz bench`, it will only run benchmarks in
 * files that match the glob `src/**\/__bench__/bench-*.js`.
 *
 * Benchmarks are executed serially within the node process to ensure that parallel tasks do not interfere with benchmark
 * results.
 *
 * As a side note, the benchmark runner does not cache anything at all so every call to the runner will execute a
 * fresh benchmark run.
 *
 * ### Running specific benchmarks
 *
 * To run some benchmarks but not others, you can change the benchmark registration function to `benchmark.only`
 * instead of `benchmark`. Like so:
 *
 * ```javascript
 * import { benchmark } from '@karimsa/wiz/bench'
 *
 * benchmark.only('run me', async b => {
 * 		// ...
 * })
 *
 * benchmark('but not me', async b => {
 * 		// ...
 * })
 * ```
 *
 * The benchmark runner that comes with `wiz` is quite similar to the one that is built into the `testing` package
 * for `go`. As such, I recommend reading Dave Cheney's blog post on
 * [How to write benchmarks in Go](https://dave.cheney.net/2013/06/30/how-to-write-benchmarks-in-go).
 */
export async function benchCommand(argv) {
	const runProfiler = Boolean(argv.profile)

	process.env.WIZ_BENCH = JSON.stringify({
		growthFn: argv.growth,
		benchTime: argv.benchTime,
		minIterations: argv.minIterations,
		maxIterations: argv.maxIterations,
	})

	try {
		await new Promise(async (resolve, reject) => {
			try {
				const args = ['-e', 'void 0']

				for await (const { file, type } of findSourceFiles({
					directory: path.join(process.cwd(), 'src'),
					cache: {},
				})) {
					if (type === 'benchmark') {
						args.unshift(file)
						args.unshift('--require')
					}
				}

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
						const error = new Error()
						error.code = 'CHILD_PROCESS'
						reject(error)
					}
				})
			} catch (error) {
				reject(error)
			}
		})
	} catch (error) {
		if (error.code !== 'CHILD_PROCESS') {
			throw error
		}

		console.error(`\nSome benchmarks failed.`)
		process.exit(1)
	}
}

/**
 * List of the possible command-line flags that can be used with `wiz bench`.
 * They are listed in camel case, but should be passed in kebab case. For more
 * information on the flags, you should run `wiz bench --help`. For less formal
 * information, here are some examples.
 *
 * **Finding bottlenecks in your code**
 *
 * There's a few different ways to profile your benchmark execution. The simplest is
 * to use the builtin profiler using the `--profile` flag. It is a good practice to add
 * `.only()` to the specific benchmarks that you want to profile. This will allow you to
 * isolate the profiler output to a single case.
 *
 * The benchmark runner is designed to allow you to profile your benchmark using the node
 * inspector as well. Let's say that the benchmark you want to profile is in
 * `src/__bench__/bench-example.js`. You can inspect this with a few different tools:
 *
 *  - With Chrome DevTools: `node --inspect-brk src/__bench__/bench-example.js` ([more info](https://nodejs.org/en/docs/inspector))
 *  - With V8: `node --prof src/__bench__/bench-example.js` ([more info](https://nodejs.org/en/docs/guides/simple-profiling/))
 *  - With 0x: `0x -o src/__bench__/bench-example.js` ([more info](http://npmjs.org/0x))
 *
 * **Customizing execution time**
 *
 * You can use the `--benchTime` flag to customize the amount of time to wait for
 * benchmarks to complete. For example, using `--benchTime=5000` will gradually increase
 * the value for `b.N()` until benchmarks take longer than 5s to complete.
 *
 * ```shell
 * $ wiz bench # waits for 1s for each benchmark
 * $ wiz bench --benchTime=5000 # waits for 5s for each benchmark
 * $ wiz bench --benchTime=10000 # waits for 10s for each benchmark
 * ```
 *
 * **Setting upper limit for benchmark iterations**
 *
 * This is more of a safety feature than anything. In the event that it might be dangerous
 * to over-execute a benchmark, you can use the `--benchRuns` flag to set an upper limit on
 * the value that `b.N()` can reach. By default, this is unbounded. If you provide a value,
 * just know that it may deter the results of your benchmark if the value is too low.
 */
export const benchFlags = {
	growth: {
		type: 'string',
		alias: 'g',
		default: 'magnitude',
		describe: 'Growth function to use for number of iterations',
	},

	profile: {
		type: 'boolean',
		alias: 'p',
		default: false,
		describe: 'Enables the wiz profiler during benchmark runs',
	},

	benchTime: {
		type: 'number',
		alias: 't',
		default: 1000,
		describe: 'Maximum time to let a benchmark run before ending the benchmark',
	},

	maxIterations: {
		type: 'number',
		describe:
			'Maximum number of iterations to allow for a benchmark (default: Infinity)',
	},

	minIterations: {
		type: 'number',
		describe:
			'Minimum number of iterations to allow for a benchmark (default: 1)',
	},
}
