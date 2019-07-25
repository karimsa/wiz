/**
 * @file disable-chokidar.js
 * @copyright 2019-present HireFast Inc. All rights reserved.
 */

const id = require.resolve('chokidar')
require.cache[id] = {
	id,
	exports: null,
}
