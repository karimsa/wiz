import * as path from 'path'
import { spawn } from 'child_process'

import ms from 'ms'
import * as rollup from 'rollup'
import MagicString from 'magic-string'
import rollupBabel from 'rollup-plugin-babel'
import rollupJSON from 'rollup-plugin-json'
import rollupReplace from 'rollup-plugin-replace'
import rollupCommonJS from 'rollup-plugin-commonjs'
import terser from 'terser'
import * as ansi from 'ansi-escapes'
import createDebug from 'debug'

import { chmod, exists } from '../fs'
import * as perf from '../perf'
import { ttywrite } from '../utils'
import { Semaphore } from '../semaphore'

const nodeVersion = '8'
const debug = createDebug('wiz:build')

function createChildProcess(entrypoint) {
	return new Promise(resolve => {
		const child = spawn(process.execPath, [entrypoint], {
			stdio: ['ignore', 'pipe', 'inherit'],
		})
		debug(`Started child process with pid: ${child.pid}`)
		child.isRunning = true

		let processStarted = false
		child.stdout.on('data', chunk => {
			if (!processStarted) {
				processStarted = true
				resolve(child)
			}
			process.stdout.write(chunk.toString('utf8'))
		})

		child.on('exit', code => {
			debug(`Process ${child.pid} exited`)

			child.isRunning = false
			if (code !== 0) {
				console.error(`[wiz] Process exited with code: ${code}`)
			}
		})
	})
}

async function runInWatchMode(entrypoint) {
	let child = await createChildProcess(entrypoint)
	const childLock = new Semaphore(1)

	return {
		async restart() {
			await this.kill()

			const token = await childLock.lock()
			try {
				child = await createChildProcess(entrypoint)
			} finally {
				await childLock.unlock(token)
			}
		},

		async kill() {
			const token = await childLock.lock()
			return new Promise(resolve => {
				if (!child.isRunning) {
					return resolve()
				}

				child.on('exit', () => resolve())
				child.kill('SIGKILL')
			}).then(() => {
				childLock.unlock(token)
			})
		},
	}
}

async function startBuild({
	input,
	srcDirectory,
	env,
	watchMode,
	runMode,
	clearScreen,
}) {
	const inputFile = input[0] === '/' ? input : path.join(process.cwd(), input)
	const outputFile = path.join(
		process.cwd(),
		path.parse(inputFile).name + '.dist.js',
	)

	if (inputFile.endsWith('index.js')) {
		throw new Error(`The filename 'index.js' is not allowed for entrypoints`)
	}
	if (
		!inputFile.startsWith(srcDirectory) ||
		!inputFile.endsWith('.js') ||
		inputFile.includes('/__tests__/')
	) {
		throw new Error(`Non-source found, refusing to build: '${inputFile}'`)
	}

	const bundle = await createBundle(watchMode, {
		input: inputFile,
		output: outputFile,
		env,
	})

	if (watchMode) {
		const child = runMode ? await runInWatchMode(outputFile) : null

		await new Promise((resolve, reject) => {
			let bundleStartTime = Date.now()

			bundle.on('event', async event => {
				debug(`Bundle emitted: ${event.code}`)
				switch (event.code) {
					case 'BUNDLE_START':
						bundleStartTime = Date.now()
						ttywrite('[wiz] Bundling ...')
						break
					case 'BUNDLE_END':
						ttywrite(`[wiz] Bundled in ${ms(Date.now() - bundleStartTime)}.\n`)
						if (child) {
							try {
								if (clearScreen) {
									process.stdout.write(ansi.clearTerminal)
								}
								await child.restart()
							} catch (error) {
								return reject(error)
							}
						}
						break
					case 'FATAL':
						return reject(event.error)
					case 'ERROR':
						console.error(event)
						break
				}
			})
			process.on('SIGINT', resolve)
		})

		await bundle.close()
	} else {
		await perf.measure('bundle write', async () => {
			await bundle.write({
				file: outputFile,
				format: 'cjs',
			})
			await chmod(outputFile, 0o700)
		})
	}
}

/**
 * **Usage**
 *
 * To build an entrypoint with wiz, you simply need to do `wiz build [path to entrypoint]`.
 * This will take the input file (which **must** be located top-level in `src/`) and build
 * it into the current directory, with `.dist.js` file extension instead of `.js`. wiz ensures
 * that `*.dist.js` exists in your `.gitignore` so all output files are ignored.
 *
 * Since rollup does not currently having persistence caching builtin, there is no cache written
 * out by wiz either. However, wiz may wrap rollup with a custom cache in the future which would
 * exist in `.wiz`. As with linting, to reset the cache, you can simply run `rm -rf .wiz` - this
 * operation is always safe.
 *
 * **Internals**
 *
 * The build tool is wrapped around wiz, and the build pipeline is as follows:
 *
 *  - `rollup-plugin-commonjs`: to support commonjs sources.
 *  - `rollup-plugin-json`: to import JSON files with regular imports.
 *  - `rollup-plugin-replace`: to replace `process.env.NODE_ENV` with production, and
 *  any environment overrides given to wiz.
 *  - `rollup-plugin-babel`: to transform your JS syntax into syntax that is supported
 *  by your current node version.
 *  - `terser`: to drop dead code, constant fold, and optimize pure functions. Mangling
 *  and obfuscation are skipped.
 *  - `add-shebang`: adds a shebang for node to the start of the output file.
 *  - `chmod`: adds execution privileges to output file.
 */
export async function buildCommand(argv) {
	if (argv._.length < 2) {
		throw new Error(`Build must specify at least one entrypoint to compile`)
	}

	const env = (typeof argv.env === 'string'
		? [argv.env]
		: argv.env || []
	).reduce((env, pair) => {
		const [key, value] = pair.split('=')
		env[`process.env.${key}`] = JSON.stringify(value)
		return env
	}, {})
	const srcDirectory = path.join(process.cwd(), 'src')
	const watchMode = Boolean(argv.watch || argv.run)
	const runMode = Boolean(argv.run)
	const clearScreen = Boolean(argv.clear)
	const goals = []

	for (let i = 1; i < argv._.length; ++i) {
		if (!(await exists(argv._[i]))) {
			throw new Error(`Source file ${argv._[i]} doesn't exist.`)
		}

		goals.push(
			startBuild({
				input: argv._[i],
				srcDirectory,
				env,
				watchMode,
				runMode,
				clearScreen,
			}),
		)
	}

	await Promise.all(goals)

	// TODO: Fix this
	// if (perf.shouldMeasurePerf()) {
	// 	const perfEntries = []
	// 	const timings = bundle.getTimings()

	// 	for (const [event, [duration]] of Object.entries(timings)) {
	// 		if (event.startsWith('treeshaking pass')) {
	// 			perfEntries.push({
	// 				name: `rollup - treeshaking`,
	// 				duration,
	// 			})
	// 		} else {
	// 			perfEntries.push({
	// 				name: `rollup - ${event}`,
	// 				duration,
	// 			})
	// 		}
	// 	}
	// 	perf.observeEntries(perfEntries)
	// }
}

/**
 * **Changing build destination**
 *
 * The `--output` flag allows you to customize the filename of the build output.
 * By default, is it `[basename].dist.js` where `[basename]` is the basename of the
 * input source file. This might be desirable since when the file is located within
 * your source files, its parent directory names help add meaning to the file's
 * purpose. However, as an output file, it has no parent directory so it might need
 * a more detailed filename.
 *
 * ```shell
 * $ wiz build src/foo.js
 * # Builds into foo.dist.js
 * $ wiz build src/foo.js -o bar.dist.js
 * # Builds into bar.dist.js
 * ```
 *
 * **Passing custom environment variables**
 *
 * The `--env` flag can be used to override environment variables that are known
 * at compile-time. For instance, `NODE_ENV` is always overriden by default within
 * `wiz` to allow projects to differentiate between their build environment vs. their
 * execution environment.
 *
 * Aside from `NODE_ENV`, you can make custom overrides too. Here's an example:
 *
 * ```javascript
 * // src/foo.js
 * console.log('%s, world', process.env.MESSAGE || 'Hello')
 * ```
 *
 * Building this with `wiz build src/foo.js` would output:
 *
 * ```javascript
 * // foo.dist.js
 * console.log('%s, world', process.env.MESSAGE || 'Hello')
 * ```
 *
 * Building this with `wiz build src/foo.js -e MESSAGE=Bye` would output:
 *
 * ```javascript
 * // foo.dist.js
 * console.log('%s, world', 'Bye')
 * ```
 */
export const buildFlags = {
	output: {
		type: 'string',
		alias: 'o',
		describe: 'Path to the output file to write bundle into',
	},
	env: {
		type: 'string',
		alias: 'e',
		describe:
			'Multiple key-value pairs to override env variables (i.e. --env KEY=VALUE)',
	},
	watch: {
		type: 'boolean',
		alias: 'w',
		describe: 'Starts builder in watch mode',
	},
	run: {
		type: 'boolean',
		alias: 'r',
		describe: 'Starts builder in run & watch mode',
	},
	clear: {
		type: 'boolean',
		alias: 'c',
		describe: 'Clear the screen on rebuild (in run mode)',
	},
}

/**
 * (Internal) Creates a rollup bundle with the pipeline preset.
 *
 * @param {String} options.input path to the input file
 * @param {Object} options.env key to value mapping for env variable overrides
 */
export async function createBundle(watchMode, { input, output, env }) {
	return perf.measure('bundle create', () =>
		(watchMode ? rollup.watch : rollup.rollup)({
			perf: perf.shouldMeasurePerf(),
			input,
			output: watchMode
				? {
						file: output,
						format: 'cjs',
				  }
				: undefined,
			external(id) {
				return id[0] !== '.' && id[0] !== '/'
			},
			plugins: [
				rollupCommonJS(),
				rollupJSON(),
				rollupReplace({
					...env,
					'process.env.NODE_ENV': JSON.stringify(
						process.env.NODE_ENV || (watchMode ? 'development' : 'production'),
					),
				}),
				rollupBabel({
					minified: false,
					babelrc: false,
					comments: false,
					plugins: [require.resolve('babel-plugin-macros')],
					presets: [
						[
							require.resolve('@babel/preset-env'),
							{
								targets: {
									node: nodeVersion,
								},
							},
						],
					],
				}),
				{
					name: 'rollup-plugin-terser',
					renderChunk(code, chunk, options) {
						if (!chunk.fileName) {
							console.warn(`Skipping minification of: %O`, chunk)
							return null
						}

						return terser.minify(code, {
							toplevel: true,
							mangle: false,
							sourceMap: options.sourcemap,
							compress: {
								pure_funcs: ['path.resolve', 'process.cwd'],
							},
							output: {
								beautify: true,
							},
						})
					},
				},
				{
					name: 'add-shebang',
					renderChunk(code, _, { sourcemap }) {
						const str = new MagicString(code)
						str.prepend('#!/usr/bin/env node\n')
						return {
							code: str.toString(),
							map: sourcemap ? str.generateMap({ hires: true }) : undefined,
						}
					},
				},
			],
		}),
	)
}
