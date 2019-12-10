import * as fs from 'fs'
import * as path from 'path'

import { mainDirectory } from './config'
import { open, close, unlink } from './fs'

async function getLockFile(type, lockFile) {
	try {
		return await open(lockFile, fs.constants.O_CREAT | fs.constants.O_EXCL)
	} catch (_) {
		throw new Error(
			`Failed to acquire wiz lock for ${type} - perhaps another wiz process is currently running?`,
		)
	}
}

export async function acquireLock(type, fn) {
	const lockFile = path.resolve(mainDirectory, `.wiz-${type}-lock`)
	const fd = await getLockFile(type, lockFile)
	try {
		return await fn()
	} finally {
		await close(fd)
		await unlink(lockFile)
	}
}
