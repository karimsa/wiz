/**
 * @file src/commands/build.js
 * @copyright Karim Alibhai. All rights reserved.
 */

import * as path from 'path'

import { rollup } from 'rollup'
import MagicString from 'magic-string'
import rollupBabel from 'rollup-plugin-babel'
import rollupJSON from 'rollup-plugin-json'
import rollupReplace from 'rollup-plugin-replace'
import rollupCommonJS from 'rollup-plugin-commonjs'

import { chmod } from '../fs'
import * as perf from '../perf'

const nodeVersion = '8'

export const buildFlags = {
	output: {
		type: 'string',
		alias: 'o',
	},
	env: {
		type: 'string',
		alias: 'e',
	},
}

export async function buildCommand(argv) {
	if (argv.input.length !== 2) {
		throw new Error(`Build must specify exactly one entrypoint to compile`)
	}

	const env = (typeof argv.flags.env === 'string'
		? [argv.flags.env]
		: argv.flags.env || []
	).reduce((env, pair) => {
		const [key, value] = pair.split('=')
		env[`process.env.${key}`] = JSON.stringify(value)
		return env
	}, {})
	const srcDirectory = path.join(process.cwd(), 'src')
	const inputFile = argv.input[1].startsWith('/')
		? argv.input[1]
		: path.join(process.cwd(), argv.input[1])
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

	const bundle = await perf.measure('bundle create', () =>
		rollup({
			perf: argv.flags.debug,
			input: inputFile,
			external(id) {
				return id[0] !== '.' && id[0] !== '/'
			},
			plugins: [
				rollupCommonJS(),
				rollupJSON(),
				rollupReplace({
					...env,
					'process.env.NODE_ENV': '"production"',
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
						[
							require.resolve('babel-preset-minify'),
							{
								mangle: false,
							},
						],
					],
				}),
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

	await perf.measure('bundle write', async () => {
		await bundle.write({
			file: outputFile,
			format: 'cjs',
		})
		await chmod(outputFile, 0o700)
	})

	if (argv.flags.debug) {
		const perfEntries = []
		const timings = bundle.getTimings()

		for (const [event, [duration]] of Object.entries(timings)) {
			if (event.startsWith('treeshaking pass')) {
				perfEntries.push({
					name: `rollup - treeshaking`,
					duration,
				})
			} else {
				perfEntries.push({
					name: `rollup - ${event}`,
					duration,
				})
			}
		}
		perf.observeEntries(perfEntries)
	}
}
