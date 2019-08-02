/**
 * @file disable-chokidar.js
 * @copyright 2019-present HireFast Inc. All rights reserved.
 */

try {
	const id = require.resolve('chokidar')
	require.cache[id] = {
		id,
		exports: null,
	}
} catch (error) {
	if (error.code !== 'MODULE_NOT_FOUND') {
		throw error
	}
}
