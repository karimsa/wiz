import createDebug from 'debug'
import * as ansi from 'ansi-escapes'

import { isCI } from './config'

const debug = createDebug('wiz')

export function ttywrite(str) {
	if (process.stderr.isTTY && !debug.enabled && !isCI) {
		process.stderr.write('\r' + ansi.eraseEndLine + str)
	}
}
