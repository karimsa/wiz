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
import { version } from '../../package.json'

const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const readdir = util.promisify(fs.readdir)
const stat = util.promisify(fs.stat)

const isDevelopmentEnv =
	(process.env.NODE_ENV || 'development') === 'development'
const cacheLocation = path.join(process.cwd(), '.prop', 'lintcache.json')

async function loadCache() {
	try {
		const cacheContents = await readFile(cacheLocation)
		const cache = JSON.parse(cacheContents)
		if (!cache.eslint || !cache.readdir || cache.version !== version) {
			throw new Error()
		}
		return cache
	} catch (err) {
		return {
			version,
			eslint: {},
			readdir: {},
		}
	}
}

async function updateCache(cache) {
	await writeFile(cacheLocation, JSON.stringify(cache))
}

async function* findSourceFiles(directory, cache, dstat) {
	// Cache only stores calls to `readdir()` which is invalidated if the modified
	// time the directory changes
	// Calls to `findSourceFiles()` themselves cannot be cached because results vary
	// based on file modification times which are independent to directory modification
	// times

	dstat = dstat || (await stat(directory))
	const cachedResults = cache[directory]
	const isCacheValid = cachedResults && cachedResults.mtime >= +dstat.mtime
	const files = isCacheValid ? cachedResults.files : await readdir(directory)

	if (!isCacheValid) {
		cache[directory] = {
			mtime: +dstat.mtime,
			files,
		}
	}

	for (const file of files) {
		// 'hidden' files are always ignored, assuming that they
		// are hidden for a reason
		if (file[0] === '.') {
			continue
		}

		const filepath = path.join(directory, file)
		const fstat = await stat(filepath)
		const mtime = +fstat.mtime

		if (fstat.isFile()) {
			if (file.endsWith('.js') && !file.endsWith('.dist.js')) {
				yield {
					file: filepath,
					mtime,
				}
			}
		} else if (file !== 'node_modules' && file !== 'dist') {
			yield* findSourceFiles(filepath, cache, fstat)
		}
	}
}

async function lintFile({ cache, engine, file, mtime }) {
	const cachedResult = cache[file]
	if (cachedResult && cachedResult.mtime >= mtime) {
		return cachedResult.report
	}

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

	// Cache must be updated last to ensure that the time is after/same as
	// the write time of the output file if the file was fixed
	cache[file] = {
		report: fileReport,
		mtime: Date.now(),
	}

	return fileReport
}

async function lintAllFiles() {
	const cache = await loadCache()

	const engine = new eslint.CLIEngine({
		baseConfig: eslintOptions,
		fix: true,
		useEslintrc: false,
	})
	const goals = []

	performance.mark('startFileSearch')
	try {
		const pkgs = await readdir('./packages')
		await Promise.all(
			pkgs.map(async pkg => {
				for await (const { file, mtime } of findSourceFiles(
					`./packages/${pkg}`,
					cache.readdir,
				)) {
					goals.push(lintFile({ cache: cache.eslint, engine, file, mtime }))
				}
			}),
		)
	} catch (err) {
		if (String(err).includes('ENOENT')) {
			for await (const { file, mtime } of findSourceFiles(
				'./src',
				cache.readdir,
			)) {
				goals.push(lintFile({ cache: cache.eslint, engine, file, mtime }))
			}
		} else {
			throw err
		}
	}
	performance.mark('endFileSearch')
	performance.measure('file search', 'startFileSearch', 'endFileSearch')

	const reports = await Promise.all(goals)
	process.stdout.write(`\r${ansi.eraseEndLine}`)
	await updateCache(cache)
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
		performance.mark('startLintReport')
		const strReport = stylish(report.results)
		performance.mark('endLintReport')
		performance.measure('lint report', 'startLintReport', 'endLintReport')
		console.log(strReport)
	}
}
