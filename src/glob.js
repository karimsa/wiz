import * as path from 'path'

import createDebug from 'debug'

import { stat, readdir } from './fs'

const debug = createDebug('wiz')

export async function* findSourceFiles({
	directory,
	cache,
	dstat,
	isTestDirectory,
	isBenchDirectory,
}) {
	// Cache only stores calls to `readdir()` which is invalidated if the modified
	// time the directory changes

	dstat = dstat || (await stat(directory))
	const cachedResults = cache[directory]
	const isCacheValid =
		cachedResults && cachedResults.mtime >= Number(dstat.mtime)
	const files = isCacheValid ? cachedResults.files : await readdir(directory)

	if (!isCacheValid) {
		if (debug.enabled) {
			debug(
				`Cache invalid for: ${directory} (cached at: ${new Date(
					cachedResults ? cachedResults.mtime : 0,
				).toLocaleDateString()}, last modified: ${new Date(
					dstat.mtime,
				).toLocaleDateString()})`,
			)
		}

		cache[directory] = {
			mtime: Number(dstat.mtime),
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
		const mtime = Number(fstat.mtime)

		if (fstat.isFile()) {
			if (file.endsWith('.js') && !file.endsWith('.dist.js')) {
				if (file.startsWith('test-') && !isTestDirectory) {
					throw new Error(
						`Found test file outside of a test directory: '${filepath}'`,
					)
				}

				const yieldInfo = {
					file: filepath,
					mtime,
					type: 'source',
				}
				if (!isBenchDirectory && isTestDirectory && file.startsWith('test-')) {
					yieldInfo.type = 'test'
				} else if (!isTestDirectory && isBenchDirectory && file.startsWith('bench-')) {
					yieldInfo.type = 'benchmark'
				}
				yield yieldInfo
			}
		} else if (file !== 'node_modules' && file !== 'dist') {
			yield* findSourceFiles({
				directory: filepath,
				cache,
				dstat: fstat,
				isTestDirectory: isTestDirectory || file === '__tests__',
				isBenchDirectory: isBenchDirectory || file === '__bench__',
			})
		}
	}
}
