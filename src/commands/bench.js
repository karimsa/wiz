/**
 * @file src/commands/bench.js
 * @copyright 2019-present Karim Alibhai. All rights reserved.
 */

import * as os from 'os'
import { spawn } from 'child_process'

import { readdir, stat } from '../fs'

async function findBenchFiles(dir, results) {
	for (const file of await readdir(dir)) {
		if (file === '__bench__') {
			const files = (await readdir(dir + '/__bench__')).map(file => {
				return dir + '/__bench__/' + file
			})
			results.push(...files)
		} else if ((await stat(dir + '/' + file)).isDirectory()) {
			await findBenchFiles(dir + '/' + file, results)
		}
	}
}

export async function benchCommand() {
	const benchFiles = []
	await findBenchFiles(process.cwd(), benchFiles)

	let targetShard = 0
	const fileShards = [...new Array(os.cpus().length)].map(() => [])
	benchFiles.forEach(file => {
		fileShards[targetShard].push(file)

		if (++targetShard === fileShards.length) {
			targetShard = 0
		}
	})

	const goals = []
	fileShards.forEach(shard => {
		if (shard.length) {
			goals.push(
				new Promise((resolve, reject) => {
					const child = spawn(
						process.execPath,
						shard.reduce(
							(args, file) => {
								args.unshift('--require')
								args.unshift(file)
								return args
							},
							['-e', '_'],
						),
						{
							stdio: 'inherit',
						},
					)

					child.on('close', code => {
						if (code === 0) {
							resolve()
						} else {
							reject(new Error(`Process exited with status code: ${code}`))
						}
					})
				}),
			)
		}
	})

	await Promise.all(goals)
}
