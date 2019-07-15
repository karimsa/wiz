/**
 * @file src/commands/test.js
 * @copyright Karim Alibhai. All rights reserved.
 */

import * as fs from 'fs'
import { spawnSync } from 'child_process'

import * as dotenv from 'dotenv'

import { isCI } from '../config'

export async function testCommand(argv) {
	const testFlags = argv.input.slice(1)
	const env = JSON.parse(JSON.stringify(process.env))

	try {
		const envContent = fs.readFileSync('.env-test', 'utf8')
		Object.assign(env, dotenv.parse(envContent))
	} catch (error) {
		if (error.code !== 'ENOENT') {
			throw error
		}
	}

	const jestArgs = [
		require.resolve('jest'),
		'--coverage',
		'--env=node',
		'--testPathPattern="src\\/.*\\/__tests__\\/test-.*\\.js"',
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
	const { status, error } = spawnSync(process.execPath, jestArgs, {
		stdio: 'inherit',
		shell: true,
		env,
	})

	if (error) {
		throw error
	}
	if (status === null) {
		throw new Error(`Process exited with null exit code`)
	}
	if (status !== 0) {
		process.exit(status)
	}
}
