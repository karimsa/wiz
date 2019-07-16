/**
 * @file src/spawn.js
 * @copyright Karim Alibhai. All rights reserved.
 */

import { spawnSync } from 'child_process'

export function spawn(args, options = {}) {
	const { status, error } = spawnSync(process.execPath, args, {
		stdio: 'inherit',
		shell: true,
		...options,
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
