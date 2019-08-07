import * as path from 'path'

import pirates from 'pirates'
import babel from '@babel/core'
import * as t from '@babel/types'
import template from '@babel/template'
import { v4 as uuid } from 'uuid'
import createDebug from 'debug'

import { cliReporter } from '../profiler/reporters/cli'

const debug = createDebug('wiz:profiler')
const superDebug = createDebug('wiz:profiler:super')
const globalID = '__PROFILER__'
const startRecording = template(
	`(global.GLOBALID && global.GLOBALID.markStart(ID))`,
)
const stopRecording = template(
	superDebug.enabled
		? `(global.GLOBALID ? global.GLOBALID.markEnd(ID, LINE, FILE) : console.warn('Skipping ' + FILE + ':' + LINE))`
		: `(global.GLOBALID && global.GLOBALID.markEnd(ID, LINE, FILE))`,
)
const recordPromise = template(`(() => {
	if (global.GLOBALID) {
		return global.GLOBALID.measurePromise(ID, LINE, FILE, () => {
			return ARG
		})
	} else {
		console.warn('Skipping measurePromise(%s:%s)', FILE, LINE)
		return ARG
	}
})()`)
const recordFuncCalls = template(`(() => {
	if (global.GLOBALID) {
		return global.GLOBALID.measureCallExp(ID, LINE, FILE, () => {
			return CALL_EXPRESSION
		})
	} else {
		console.warn('Skipping measureCallExp(%s:%s)', FILE, LINE)
		return CALL_EXPRESSION
	}
})()`)

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

function transform(filename) {
	return {
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
			CallExpression(path) {
				if (!path.node.loc) {
					return
				}

				const ID = t.stringLiteral(uuid())
				path.replaceWith(
					recordFuncCalls({
						ID,
						GLOBALID: globalID,
						LINE: t.numericLiteral(path.node.loc.start.line),
						FILE: t.stringLiteral(filename),
						CALL_EXPRESSION: path.node,
					}).expression,
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
	}
}

export const profileFlags = {
	reporter: {
		type: 'string',
		alias: 'r',
		default: 'cli',
	},

	minThreshold: {
		type: 'number',
		alias: 't',
		default: 100,
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

export function injectProfiler({
	reporter,
	minThreshold,
	absolutePaths,
	ignoreNodeModules,
	onExit,
}) {
	debug('Enabling wiz profiler')

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
		reporter[0] === '.' || reporter[0] === '/'
			? path.resolve(process.cwd(), reporter)
			: reporter,
	)

	const Profiler = (global[globalID] = {
		data: new Map(),
		timers: new Map(),

		markStart(id) {
			debug(`Event started: ${id}`)
			this.timers.set(id, Date.now())
		},

		markEnd(id, line, filepath, type = 'line') {
			debug(`Event ended: ${id}`)
			const start = this.timers.get(id)

			const { moduleName, file } = getModuleName(filepath)
			const fileID = (absolutePaths ? filepath : file) + ':' + line

			const prev = this.data.get(fileID)
			if (prev) {
				prev.duration += Date.now() - start
				prev.ticks++
			} else {
				this.data.set(fileID, {
					type,
					duration: Date.now() - start,
					line,
					moduleName,
					file,
					fileID,
					ticks: 1,
				})
			}
		},

		measureCallExp(id, line, file, fn) {
			Profiler.markStart(id)
			const result = fn()
			Profiler.markEnd(id, line, file, 'callExpression')
			return result
		},

		async measurePromise(id, line, file, fn) {
			try {
				Profiler.markStart(id)
				return await fn()
			} catch (error) {
				throw error
			} finally {
				Profiler.markEnd(id, line, file, 'promise')
			}
		},

		exit() {
			reportEvents(
				Array.from(Profiler.data.values())
					.sort((a, b) => {
						return b.duration - a.duration
					})
					.filter(event => {
						return event.duration >= minThreshold
					}),
				{
					minThreshold,
				},
			)
			onExit()
		},
	})

	process.on('beforeExit', () => Profiler.exit())

	const exit = process.exit
	process.exit = code => {
		Profiler.exit()
		return exit(code)
	}

	let compiling = false
	pirates.addHook(
		function(code, filename) {
			if (
				compiling ||
				!filename.endsWith('.js') ||
				filename.includes('babel') ||
				filename.includes('istanbul')
			) {
				return code
			}

			try {
				compiling = true
				debug(`Instrumenting: ${filename}`)
				const transformedCode = babel.transformSync(code, {
					plugins: [transform(filename)],
				}).code
				superDebug(`${filename} => ${transformedCode}`)
				return transformedCode
			} finally {
				compiling = false
			}
		},
		{
			ignoreNodeModules,
		},
	)
}
