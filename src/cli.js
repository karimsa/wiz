/**
 * @file src/index.js
 * @copyright Karim Alibhai. All rights reserved.
 */

import ms from 'ms'
import meow from 'meow'
import updateNotifier from 'update-notifier'

import * as performance from './perf'
import { setup } from './setup'
import { lintCommand, lintFlags } from './commands/lint'
import { buildCommand, buildFlags } from './commands/build'
import { testCommand } from './commands/test'

const argv = meow(
	`
    Usage
        $ wiz [command] [options]

    Commands
        lint    Check all your source files for code quality
        build   Builds the current project into a target
        test    Run tests for the current project
        bench   Run benchmarks for the current project

    Options:
        -h, --help  	Print this help message
        -v, --version   Print the current version
        -d, --debug		Enable debug mode
`,
	{
		flags: {
			debug: {
				type: 'boolean',
				alias: 'd',
			},

			...lintFlags,
			...buildFlags,
		},
	},
)

updateNotifier({ pkg: argv.pkg }).notify()

if (argv.flags.debug) {
	performance.enableHooks()
}

async function main() {
	if (argv.input.length === 0) {
		argv.showHelp()
	}

	await setup()

	switch (argv.input[0]) {
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

		default:
			console.error(`Unrecognized command: '${argv.input[0]}'`)
			argv.showHelp()
	}
}

const commandStartTime = Date.now()
main()
	.then(shouldFail => {
		console.log(`${argv.input[0]}: ${ms(Date.now() - commandStartTime)}`)

		if (shouldFail === true) {
			process.emit('beforeExit')
			process.exit(1)
		}
	})
	.catch(err => {
		console.error(err.stack)
		process.exit(1)
	})
