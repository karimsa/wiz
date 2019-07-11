/**
 * @file src/commands/build.js
 * @copyright Karim Alibhai. All rights reserved.
 */

import * as path from 'path'
import { performance } from 'perf_hooks'

import { rollup } from 'rollup'
import MagicString from 'magic-string'
import rollupBabel from 'rollup-plugin-babel'
import rollupJSON from 'rollup-plugin-json'
import rollupReplace from 'rollup-plugin-replace'
import rollupCommonJS from 'rollup-plugin-commonjs'

import { chmod } from '../fs'

const nodeVersion = '8'

export const buildFlags = {
	output: {
		type: 'string',
		alias: 'o',
	},
}

export async function buildCommand(argv) {
	if (argv.input.length > 2) {
		throw new Error(`Build must specify at most one entrypoint to compile`)
	}

	const srcDirectory = path.join(process.cwd(), 'src')
	const inputFile = argv.input[1]
		? argv.input[1].startsWith('/')
			? argv.input[1]
			: path.join(process.cwd(), argv.input[1])
		: path.join(process.cwd(), 'src/index.js')
	const outputFile = path.resolve(argv.output || './index.dist.js')

	if (
		!inputFile.startsWith(srcDirectory) ||
		!inputFile.endsWith('.js') ||
		inputFile.includes('/__tests__/')
	) {
		throw new Error(`Non-source found, refusing to build: '${inputFile}'`)
	}

	performance.mark('startCreateBundle')
	const bundle = await rollup({
		input: inputFile,
		external(id) {
			return id[0] !== '.' && id[0] !== '/'
		},
		plugins: [
			rollupCommonJS(),
			rollupJSON(),
			rollupReplace({
				'process.env.NODE_ENV': '"production"',
			}),
			rollupBabel({
				minified: false,
				babelrc: false,
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
	})
	performance.mark('endCreateBundle')
	performance.measure('bundle create', 'startCreateBundle', 'endCreateBundle')

	performance.mark('startBundleWrite')
	await bundle.write({
		file: outputFile,
		format: 'cjs',
	})
	await chmod(outputFile, 0o700)
	performance.mark('endBundleWrite')
	performance.measure('bundle write', 'startBundleWrite', 'endBundleWrite')
}
