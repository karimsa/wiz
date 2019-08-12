import createDebug from 'debug'
import * as ansi from 'ansi-escapes'

import { isCI } from './config'

const debug = createDebug('wiz')

export function ttywrite(stream, str) {
	if (str === undefined) {
		str = stream
		stream = process.stdout
	}

	if (process.stdout.isTTY && !debug.enabled && !isCI) {
		stream.write('\r' + ansi.eraseEndLine + str)
	}
}
