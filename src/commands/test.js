/**
 * @file src/commands/test.js
 * @description Runs tests via jest for the project.
 * @copyright 2019-present Karim Alibhai. All rights reserved.
 */

import * as fs from 'fs'
import * as path from 'path'

import * as dotenv from 'dotenv'

import { isCI } from '../config'
import { spawn } from '../spawn'
import { writeFile } from '../fs'
import * as performance from '../perf'

function findJest() {
	const jestDirectory = require.resolve('jest').split('/')
	while (jestDirectory.length > 0) {
		if (jestDirectory[jestDirectory.length - 1] === 'node_modules') {
			break
		}
		jestDirectory.pop()
	}
	if (!jestDirectory.length) {
		throw new Error(`Could not find jest`)
	}

	const jestPath = jestDirectory.join('/') + '/jest'
	const jestPackage = require(`${jestPath}/package.json`)
	return path.resolve(jestPath, jestPackage.bin.jest)
}

export async function testCommand(argv) {
	const testFlags = argv.input.slice(1)

	const env = await performance.measure('load env', () => {
		const env = JSON.parse(JSON.stringify(process.env))
		try {
			const envContent = fs.readFileSync('.env-test', 'utf8')
			return Object.assign(env, dotenv.parse(envContent))
		} catch (error) {
			if (error.code !== 'ENOENT') {
				throw error
			}
		}
		return env
	})

	try {
		await writeFile(
			'./.babelrc',
			JSON.stringify(
				{
					presets: [
						[
							'@babel/preset-env',
							{
								targets: {
									node: '8',
								},
							},
						],
					],
				},
				null,
				'\t',
			),
			{
				flag: 'wx',
			},
		)
	} catch (error) {
		if (error.code !== 'EEXIST') {
			throw error
		}
	}

	const jestArgs = [
		await performance.measure('find jest', findJest),
		'--coverage',
		'--env=node',
		'--testPathPattern="src(\\/.*)?\\/__tests__\\/test-.*\\.js"',
	]
	if (isCI) {
		jestArgs.push('--ci')
		jestArgs.push('--no-cache')
	} else {
		jestArgs.push('--onlyChanged')
		jestArgs.push('--notify')
	}

	if (argv.flags.debug) {
		jestArgs.push('--debug')
	}

	testFlags.forEach(flag => {
		if (!flag.startsWith('--') || flag.startsWith('--testPathPattern')) {
			throw new Error(`Jest test patterns cannot be overridden`)
		}

		jestArgs.push(flag)
	})

	if (argv.flags.debug) {
		console.log(`Running jest with: %O`, jestArgs)
	}

	spawn(jestArgs, {
		env,
	})
}
