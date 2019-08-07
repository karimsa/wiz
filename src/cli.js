/**
 * ## Project structure
 * Though using `wiz` does not have any configuration or project setup, there are a few rules that are imposed onto
 * projects.
 *
 *   * All source files must be located within `src/`. Each wiz command depends on this rule & will error out if you try to break it.
 *   * All test files must be match the glob `src/**\/__tests__/test-*.js`.
 *   * All benchmark files must match the glob `src/**\/__bench__/bench-*.js`.
 *   * All entrypoints must exist top-level in `src/` and must be named something other than `index.js`.
 *
 * "Hidden" files and directories (prefixed with a `.`) will always be ignored.
 *
 * When wiz is called, it will create a local directory to store its cache within called `.wiz`. It will also ensure that this folder is added to your `.gitignore` file. On a CI system, this folder is ignored if it exists and not created if it doesn’t.
 */

import ms from 'ms'
import updateNotifier from 'update-notifier'
import createDebug from 'debug'
import yargs from 'yargs'

import * as pkg from '../package.json'
import * as performance from './perf'
import { setup } from './setup'
import { lintCommand, lintFlags } from './commands/lint'
import { buildCommand, buildFlags } from './commands/build'
import { testCommand, testFlags } from './commands/test'
import { profileCommand } from './commands/profile'
import { profileFlags } from './profiler'
import { benchCommand, benchFlags } from './commands/bench'
import { docCommand, docFlags } from './commands/doc'

const debug = createDebug('wiz')
const { argv } = yargs
	.scriptName('wiz')
	.usage('$0 [command] [options]')
	.strict()
	.option('debug', {
		alias: 'd',
		describe: 'Enables debug mode for wiz',
	})
	.command('lint', 'Check all your source files for code quality', lintFlags)
	.command('build', 'Builds the current project into a target', buildFlags)
	.command('test', 'Run tests for the current project', testFlags)
	.command('bench', 'Run benchmarks for the current project', benchFlags)
	.command('profile', 'Profile an application for performance', profileFlags)
	.command('doc', 'Generate documentation for project', docFlags)

updateNotifier({ pkg }).notify()

if (argv.debug) {
	performance.enableHooks()
}

async function main() {
	if (argv._.length === 0) {
		yargs.showHelp()
		process.exit(1)
	}

	await setup()
	debug(`CLI started with arguments: %O`, argv)

	switch (argv._[0]) {
		case 'lint':
			return lintCommand(argv)

		case 'build':
			if (await lintCommand(argv)) {
				return true
			}
			return buildCommand(argv)

		case 'test':
			if (await lintCommand(argv)) {
				return true
			}
			return testCommand(argv)

		case 'profile':
			if (await lintCommand(argv)) {
				return true
			}
			return profileCommand(argv)

		case 'bench':
			if (await lintCommand(argv)) {
				return true
			}
			return benchCommand(argv)

		case 'doc':
			if (await lintCommand(argv)) {
				return true
			}
			return docCommand(argv)

		default:
			console.error(`Unrecognized command: '${argv._[0]}'`)
			yargs.showHelp()
			process.exit(1)
	}
}

const commandStartTime = Date.now()
main()
	.then(shouldFail => {
		console.log(`${argv._[0]}: ${ms(Date.now() - commandStartTime)}`)

		if (shouldFail === true) {
			debug(`Force exiting wiz`)
			process.emit('beforeExit')
			process.exit(1)
		}
	})
	.catch(err => {
		console.error(err.stack)
		process.exit(1)
	})
