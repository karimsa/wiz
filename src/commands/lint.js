/**
 * Check source files for formatting issues & quality.
 */

import * as path from 'path'
import { performance } from 'perf_hooks'

import eslint from 'eslint'
import stylish from 'eslint/lib/cli-engine/formatters/stylish'
import * as ansi from 'ansi-escapes'
import createDebug from 'debug'

import eslintOptions from '../../.eslintrc.dist'
import { version } from '../../package.json'
import { CurrentNodeEnv, mainDirectory, isCI } from '../config'
import { readFile, writeFile, readdir } from '../fs'
import { findSourceFiles } from '../glob'
import { ttywrite } from '../utils'

const debug = createDebug('wiz')
const isDevelopmentEnv =
	(process.env.NODE_ENV || 'development') === 'development'
const cacheLocation = path.join(mainDirectory, 'lintcache.json')

export const lintFlags = {
	ignoreCache: {
		type: 'boolean',
	},
}

function initCache(reason) {
	debug(`Skipping cache load: ${reason}`)
	return {
		version,
		eslint: {},
		readdir: {},
	}
}

async function loadCache(argv) {
	if (argv.ignoreCache) {
		console.warn(`Warning: Ignoring cache`)
		return initCache()
	}

	// automatically ignore caching for non-development environments
	if (CurrentNodeEnv !== 'development') {
		return initCache(`NODE_ENV => ${CurrentNodeEnv}`)
	}

	// automatically ignore caching for CI environments
	if (isCI) {
		return initCache('CI env')
	}

	try {
		const cacheContents = await readFile(cacheLocation)
		const cache = JSON.parse(cacheContents)
		if (!cache.eslint || !cache.readdir || cache.version !== version) {
			throw new Error()
		}
		debug(`Loaded cache from ${cacheLocation}: %O`, cache)
		return cache
	} catch (err) {
		return initCache(`Failed to load cache - ${err.stack}`)
	}
}

async function updateCache(cache) {
	await writeFile(cacheLocation, JSON.stringify(cache))
}

async function lintFile({ cache, engine, file, mtime }) {
	const cachedResult = cache[file]
	const isCacheValid = cachedResult && cachedResult.mtime >= mtime
	debug(
		`Cache ${
			isCacheValid ? 'valid' : 'invalid'
		} for: ${file} (last modified at: ${new Date(
			mtime,
		).toLocaleString()}, cached at: ${new Date(
			cachedResult ? cachedResult.mtime : 0,
		).toLocaleString()})`,
	)
	if (isCacheValid) {
		return cachedResult.report
	}

	const filepath = path.resolve(process.cwd(), file)
	performance.mark('startReadFile')
	const source = await readFile(filepath, 'utf8')
	performance.mark('endReadFile')
	performance.measure('file read', 'startReadFile', 'endReadFile')

	ttywrite(`\r${ansi.eraseEndLine}${file}`)
	performance.mark('startLint')
	const fileReport = engine.executeOnText(source, filepath)
	performance.mark('endLint')
	performance.measure('lint', 'startLint', 'endLint')

	if (
		isDevelopmentEnv &&
		fileReport.results.length > 0 &&
		Reflect.has(fileReport.results[0], 'output')
	) {
		ttywrite('\n')
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

async function lintAllFiles(argv) {
	performance.mark('startCacheLoad')
	const cache = await loadCache(argv)
	performance.mark('endCacheLoad')
	performance.measure('load cache', 'startCacheLoad', 'endCacheLoad')

	const engine = new eslint.CLIEngine({
		...eslintOptions,
		cwd: __dirname,
		fix: true,
		allowInlineConfig: false,
		useEslintrc: false,
	})
	const testEngine = new eslint.CLIEngine({
		...eslintOptions,
		envs: ['es6', 'node', 'jest'],
		cwd: __dirname,
		fix: true,
		allowInlineConfig: false,
		useEslintrc: false,
	})
	const goals = []

	performance.mark('startFileSearch')
	try {
		const pkgs = await readdir('./packages')
		await Promise.all(
			pkgs.map(async pkg => {
				for await (const { file, mtime, type } of findSourceFiles({
					directory: `./packages/${pkg}`,
					cache: cache.readdir,
				})) {
					goals.push(
						lintFile({
							cache: cache.eslint,
							engine: type === 'test' ? testEngine : engine,
							file,
							mtime,
						}),
					)
				}
			}),
		)
	} catch (err) {
		if (String(err).includes('ENOENT')) {
			for await (const { file, mtime, type } of findSourceFiles({
				directory: './src',
				cache: cache.readdir,
			})) {
				goals.push(
					lintFile({
						cache: cache.eslint,
						engine: type === 'test' ? testEngine : engine,
						file,
						mtime,
					}),
				)
			}
		} else {
			throw err
		}
	}
	performance.mark('endFileSearch')
	performance.measure('file search', 'startFileSearch', 'endFileSearch')

	const reports = await Promise.all(goals)
	ttywrite(`\r${ansi.eraseEndLine}`)
	await updateCache(cache)
	return reports
}

export async function lintCommand(argv) {
	const allResults = await lintAllFiles(argv)
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
		return true
	}
}
