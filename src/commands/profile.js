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

import { cliReporter } from '../profiler/reporters/cli'

const globalID = '__PROFILER__'
const startRecording = template(`global.GLOBALID.markStart(ID)`)
const stopRecording = template(`global.GLOBALID.markEnd(ID, LINE, FILE)`)

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
}

export function profileCommand(argv) {
	if (argv.input.length !== 2) {
		console.error(`Please provide one entrypoint`)
		process.exit(1)
	}

	const entrypoint = argv.input[1]
	const reportEvents = (function(reporterPath) {
		switch (reporterPath) {
			case 'cli':
				return cliReporter
			// case 'html': return htmlReporter

			default:
				require(reporterPath)
		}
	})(
		argv.flags.reporter[0] === '.' || argv.flags.reporter[0] === '/'
			? path.resolve(process.cwd(), argv.flags.reporter)
			: argv.flags.reporter,
	)

	const transform = filename => () => ({
		visitor: {
			ExpressionStatement(path) {
				if (!path.node.loc) {
					return
				}

				const ID = t.stringLiteral(uuid())
				path.replaceWithMultiple([
					startRecording({
						ID,
						GLOBALID: globalID,
					}),
					path.node,
					stopRecording({
						ID,
						GLOBALID: globalID,
						LINE: t.numericLiteral(path.node.loc.start.line),
						FILE: t.stringLiteral(filename),
					}),
				])
			},
		},
	})

	let compiling = false
	pirates.addHook(
		function(code, filename) {
			if (filename.includes('babel') || compiling) {
				return code
			}

			try {
				compiling = true
				return babel.transformSync(code, {
					plugins: [transform(filename)],
				}).code
			} finally {
				compiling = false
			}
		},
		{
			ignoreNodeModules: false,
		},
	)

	const Profiler = (global[globalID] = {
		data: new Map(),
		timers: new Map(),

		markStart(id) {
			this.timers.set(id, Date.now())
		},

		markEnd(id, line, file) {
			const start = this.timers.get(id)

			let moduleName = '(local)'
			const scopedModName = file.match(/\/node_modules\/(@.*?\/.*?)(\/.*$)/)
			if (scopedModName) {
				moduleName = scopedModName[1]
				file = moduleName + scopedModName[2]
			} else {
				const modName = file.match(/\/node_modules\/(.*?)(\/.*$)/)
				if (modName) {
					moduleName = modName[1]
					file = moduleName + modName[2]
				} else {
					file = file.replace(process.cwd(), '.')
				}
			}

			const fileID = file + ':' + line
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

		exit() {
			reportEvents(
				Array.from(Profiler.data.values())
					.sort((a, b) => {
						return b.duration - a.duration
					})
					.filter(event => {
						return event.duration >= argv.flags.minThreshold
					}),
			)
		},
	})

	process.on('beforeExit', () => Profiler.exit())

	const exit = process.exit
	process.exit = code => {
		Profiler.exit()
		return exit(code)
	}

	require(path.resolve(process.cwd(), entrypoint))
}
