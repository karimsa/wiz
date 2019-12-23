/**
 * Runs tests via jest for the project.
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

export const testFlags = {
	profile: {
		type: 'string',
		alias: 'p',
	},
}

/**
 * The test command is a wrapper around `jest` that adds a few nice-to-have
 * features & defaults around jest.
 *
 * Firstly, test file patterns are restricted. All tests must be located in
 * a directory called `__tests__`, but you can have as many `__tests__` directories
 * as you want, and they can be located anywhere in your project, as long as they
 * are nested under the `src/` folder. For instance:
 *
 * Valid test paths:
 *  - `src/__tests__/`
 *  - `src/services/redis/__tests__`
 *
 * Invalid test pathS:
 *  - `__tests__`
 *  - `integration/__tests__`
 *
 * Furthermore, every test file must follow the glob pattern `test-*.js`.
 *
 * Valid test files:
 *  - `test-feature.js`
 *  - `test-another-feature.js`
 *
 * Invalid test files:
 *   - `feature.test.js`
 *   - `tests-feature.js`
 *   - `feature.js`
 *
 * If there are source files located in `__tests__` directory that do not match the
 * test file pattern, they are linted as test files but are ignored by jest. The use
 * case here is to be able to write shared modules / helper modules for your tests. The
 * linter will automatically set the right eslint options depending on whether your file
 * is located in `__tests__` or not.
 *
 * All test files **must** be top-level in the `__tests__` directory, since the `__tests__`
 * directory should be in the same directory as the feature you are testing.
 *
 * If a `.env-test` or `.env.test` file is available in the root of your project, wiz will
 * automatically load it into the environment before running your tests. If no `.babelrc` exists,
 * wiz will generate a simple one using `@babel/preset-env` to trigger jest's transpilation.
 *
 * wiz also automatically detects if you are running in a CI environment and will disable
 * caching and enable `--ci` for you.
 *
 * If you wish to pass any flags to `jest` that wiz does not, you can simply use the `--`
 * flag to separate your wiz flags from your jest flags. For example:
 *
 * ```
 * $ wiz test -- --runInBand --forceExit
 * ```
 *
 * If you wish to run testing on a single file, you must call `jest` directly, which does
 * not require any specical overrides. Simply:
 *
 * ```
 * $ jest src/__tests__/test-single.js
 * ```
 */
export async function testCommand(argv) {
	const testFlags = argv._.slice(1)

	const env = await performance.measure('load env', () => {
		const env = JSON.parse(JSON.stringify(process.env))
		try {
			const envContent = fs.readFileSync('.env-test', 'utf8')
			Object.assign(env, dotenv.parse(envContent))
		} catch (error) {
			if (error.code !== 'ENOENT') {
				throw error
			}
		}
		try {
			const envContent = fs.readFileSync('.env.test', 'utf8')
			Object.assign(env, dotenv.parse(envContent))
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

	if (typeof argv.profile === 'string') {
		jestArgs.push(
			`--setupTestFrameworkScriptFile="${__dirname}/register-profiler.dist.js"`,
		)
		jestArgs.push(`--runInBand`)
		env.WIZ_PROFILER_ARGS = argv.profile
	}

	testFlags.forEach(flag => {
		if (
			(isCI && !flag.startsWith('-')) ||
			flag.startsWith('--testPathPattern')
		) {
			throw new Error(`Jest test patterns cannot be overridden`)
		}

		jestArgs.push(flag)
	})

	if (argv.debug) {
		console.log(`Running jest with: %O`, jestArgs)
	}

	spawn(jestArgs, {
		env,
	})
}
