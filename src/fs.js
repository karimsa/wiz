import * as fs from 'fs'

import createDebug from 'debug'

import * as performance from './perf'

const debug = createDebug('wiz')

function promisify(object, method) {
	const fn = object[method]

	return async function(...args) {
		return performance.measure(
			method,
			() =>
				new Promise((resolve, reject) => {
					args.push(function(err, results) {
						if (err) {
							reject(err)
						} else {
							resolve(results)
						}
					})
					debug(`${method}(%O)`, args[0])
					fn.apply(this, args)
				}),
		)
	}
}

export const readFile = promisify(fs, 'readFile')
export const writeFile = promisify(fs, 'writeFile')
export const readdir = promisify(fs, 'readdir')
export const stat = promisify(fs, 'stat')
export const mkdir = promisify(fs, 'mkdir')
export const chmod = promisify(fs, 'chmod')
