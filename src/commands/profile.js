/**
 * @file src/commands/profile.js
 * @copyright 2019-present Karim Alibhai. All rights reserved.
 */

import * as path from 'path'

import pirates from 'pirates'
import babel from '@babel/core'
import * as t from '@babel/types'
import template from '@babel/template'
import { v4 as uuid } from 'uuid'
import createDebug from 'debug'

import { cliReporter } from '../profiler/reporters/cli'

const debug = createDebug('wiz')
const globalID = '__PROFILER__'
const startRecording = template(`global.GLOBALID.markStart(ID)`)
const stopRecording = template(`global.GLOBALID.markEnd(ID, LINE, FILE)`)
const recordPromise = template(`global.GLOBALID.measurePromise(ID, LINE, FILE, () => {
	return ARG
})`)

export const profileFlags = {
	reporter: {
		type: 'string',
		alias: 'r',
		default: 'cli',
	},

	minThreshold: {
		type: 'number',
		alias: 't',
		default: 10,
	},

	ignoreNodeModules: {
		type: 'boolean',
		alias: 'i',
		default: false,
	},

	absolutePaths: {
		type: 'boolean',
		alias: 'a',
		default: false,
	},
}

function getModuleName(file) {
	file = file.split('/')

	for (let i = file.length - 1; i > -1; --i) {
		if (file[i] === 'node_modules') {
			if (file[i + 1][0] === '@') {
				return {
					moduleName: file[i + 1] + '/' + file[i + 2],
					file: file.slice(i + 1).join('/'),
				}
			}
			return {
				moduleName: file[i + 1],
				file: file.slice(i + 1).join('/'),
			}
		}
	}

	return {
		moduleName: '(local)',
		file: file.join('/').replace(process.cwd(), '.'),
	}
}

export function profileCommand(argv) {
	if (argv._.length !== 2) {
		console.error(`Please provide one entrypoint`)
		process.exit(1)
	}

	const entrypoint = argv._[1]
	const reportEvents = (function(reporterPath) {
		debug(`Loading reporter: ${reporterPath}`)
		switch (reporterPath) {
			case 'cli':
				return cliReporter
			// case 'html': return htmlReporter

			default:
				require(reporterPath)
		}
	})(
		argv.reporter[0] === '.' || argv.reporter[0] === '/'
			? path.resolve(process.cwd(), argv.reporter)
			: argv.reporter,
	)

	const transform = filename => () => ({
		visitor: {
			ExpressionStatement(path) {
				if (!path.node.loc) {
					return
				}

				const ID = t.stringLiteral(uuid())
				path.replaceWith(
					t.sequenceExpression([
						startRecording({
							ID,
							GLOBALID: globalID,
						}).expression,
						path.node.expression,
						stopRecording({
							ID,
							GLOBALID: globalID,
							LINE: t.numericLiteral(path.node.loc.start.line),
							FILE: t.stringLiteral(filename),
						}).expression,
					]),
				)
				path.skip()
			},
			AwaitExpression(path) {
				if (!path.node.loc) {
					return
				}

				const ID = t.stringLiteral(uuid())
				path.node.argument = recordPromise({
					ID,
					GLOBALID: globalID,
					LINE: t.numericLiteral(path.node.loc.start.line),
					FILE: t.stringLiteral(filename),
					ARG: path.node.argument,
				}).expression
				path.skip()
			},
		},
	})

	return new Promise(resolveExit => {
		let compiling = false
		pirates.addHook(
			function(code, filename) {
				if (compiling) {
					return code
				}

				try {
					compiling = true
					debug(`Instrumenting: ${filename}`)
					const transformedCode = babel.transformSync(code, {
						plugins: [transform(filename)],
					}).code
					debug(`${filename} => ${transformedCode}`)
					return transformedCode
				} finally {
					compiling = false
				}
			},
			{
				ignoreNodeModules: argv.ignoreNodeModules,
			},
		)

		const Profiler = (global[globalID] = {
			data: new Map(),
			timers: new Map(),

			markStart(id) {
				debug(`Event started: ${id}`)
				this.timers.set(id, Date.now())
			},

			markEnd(id, line, filepath) {
				debug(`Event ended: ${id}`)
				const start = this.timers.get(id)

				const { moduleName, file } = getModuleName(filepath)
				const fileID = (argv.absolutePaths ? filepath : file) + ':' + line

				const prev = this.data.get(fileID)
				if (prev) {
					prev.duration += Date.now() - start
					prev.ticks++
				} else {
					this.data.set(fileID, {
						duration: Date.now() - start,
						line,
						moduleName,
						file,
						fileID,
						ticks: 1,
					})
				}
			},

			async measurePromise(id, line, file, fn) {
				try {
					Profiler.markStart(id)
					return await fn()
				} catch (error) {
					throw error
				} finally {
					Profiler.markEnd(id, line, file)
				}
			},

			exit() {
				reportEvents(
					Array.from(Profiler.data.values())
						.sort((a, b) => {
							return b.duration - a.duration
						})
						.filter(event => {
							return event.duration >= argv.minThreshold
						}),
				)
				resolveExit()
			},
		})

		process.on('beforeExit', () => Profiler.exit())

		const exit = process.exit
		process.exit = code => {
			Profiler.exit()
			return exit(code)
		}

		// avoid dropping require
		debug(`Loading: ${entrypoint}`)
		require(path.resolve(process.cwd(), entrypoint))
	})
}
