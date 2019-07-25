/**
 * @file src/register-profiler.js
 * @copyright 2019-present Karim Alibhai. All rights reserved.
 */

import Yargs from 'yargs/yargs'

import { injectProfiler, profileFlags } from './profiler'

const argv = Yargs(process.env.WIZ_PROFILER_ARGS).options(profileFlags).argv

injectProfiler({
	reporter: argv.reporter,
	minThreshold: argv.minThreshold,
	absolutePaths: argv.absolutePaths,
	ignoreNodeModules: argv.ignoreNodeModules,
	onExit() {},
})
