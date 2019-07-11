#!/usr/bin/env node

// @file: lint.js
// @description: Check source files for formatting issues & quality
// @copyright: 2019-present Karim Alibhai.

import * as fs from 'fs'
import * as path from 'path'
import * as util from 'util'
import { performance } from 'perf_hooks'

import eslint from 'eslint'
import stylish from 'eslint/lib/cli-engine/formatters/stylish'
import * as ansi from 'ansi-escapes'

import eslintOptions from '../../.eslintrc'

const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const readdir = util.promisify(fs.readdir)
const stat = util.promisify(fs.stat)

const isDevelopmentEnv =
	(process.env.NODE_ENV || 'development') === 'development'

async function* findSourceFiles(directory) {
	const files = await readdir(directory)

	for (const file of files) {
		const filepath = path.join(directory, file)
		if ((await stat(filepath)).isFile()) {
			if (file.endsWith('.js') && !file.endsWith('.dist.js')) {
				yield filepath
			}
		} else if (file !== 'node_modules' && file !== 'dist') {
			yield* findSourceFiles(filepath)
		}
	}
}

async function lintFile(engine, file) {
	const filepath = path.resolve(process.cwd(), file)
	performance.mark('startReadFile')
	const source = await readFile(filepath, 'utf8')
	performance.mark('endReadFile')
	performance.measure('file read', 'startReadFile', 'endReadFile')

	process.stdout.write(`\r${ansi.eraseEndLine}${file}`)
	performance.mark('startLint')
	const fileReport = engine.executeOnText(source, filepath)
	performance.mark('endLint')
	performance.measure('lint', 'startLint', 'endLint')

	if (
		isDevelopmentEnv &&
		fileReport.results.length > 0 &&
		Reflect.has(fileReport.results[0], 'output')
	) {
		console.log()
		performance.mark('startWriteFile')
		await writeFile(filepath, fileReport.results[0].output)
		performance.mark('endWriteFile')
		performance.measure('file write', 'startWriteFile', 'endWriteFile')
	}

	return fileReport
}

async function lintAllFiles() {
	const engine = new eslint.CLIEngine({
		baseConfig: eslintOptions,
		fix: true,
		useEslintrc: false,
	})
	const goals = []

	performance.mark('startFileSearch')
	try {
		for (const pkg of await readdir('./packages')) {
			for await (const file of findSourceFiles(`./packages/${pkg}`)) {
				goals.push(lintFile(engine, file))
			}
		}
	} catch (err) {
		if (String(err).includes('ENOENT')) {
			for await (const file of findSourceFiles('./src')) {
				goals.push(lintFile(engine, file))
			}
		} else {
			throw err
		}
	}
	performance.mark('endFileSearch')
	performance.measure('file search', 'startFileSearch', 'endFileSearch')

	const reports = await Promise.all(goals)
	process.stdout.write(`\r${ansi.eraseEndLine}`)
	return reports
}

export async function lintCommand() {
	const allResults = await lintAllFiles()
	const report = allResults.reduce(
		(report, fileResults) => {
			fileResults.results.forEach(result => {
				report.results.push(result)
			})

			return {
				results: report.results,
				errorCount: report.errorCount + fileResults.errorCount,
				warningCount: report.warningCount + fileResults.warningCount,
				fixableErrorCount:
					report.fixableErrorCount + fileResults.fixableErrorCount,
				fixableWarningCount:
					report.fixableWarningCount + fileResults.fixableWarningCount,
			}
		},
		{
			results: [],
			errorCount: 0,
			warningCount: 0,
			fixableErrorCount: 0,
			fixableWarningCount: 0,
		},
	)

	if (report.errorCount > 0) {
		console.log(stylish(report.results))
	}
}
