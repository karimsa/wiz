/**
 * @file src/setup-prop.js
 * @copyright Karim Alibhai. All rights reserved.
 */

import { stat, mkdir, readFile, writeFile } from './fs'

export async function setup() {
	try {
		await stat('./.prop')
	} catch (err) {
		await mkdir('./.prop')

		try {
			await stat('./.gitattributes')
		} catch (err) {
			if (String(err).includes('ENOENT')) {
				await writeFile('.gitattributes', '* text=auto')
			} else {
				throw err
			}
		}

		try {
			const gitignore = (await readFile('.gitignore', 'utf8')).split(/\r?\n/g)
			let gitignoreChanged = false

			if (!gitignore.includes('.prop')) {
				gitignoreChanged = true
				gitignore.push('.prop')
			}

			if (!gitignore.includes('*.dist.js')) {
				gitignoreChanged = true
				gitignore.push('*.dist.js')
			}

			if (gitignoreChanged) {
				await writeFile('.gitignore', gitignore.join('\r\n'))
			}
		} catch (err) {
			if (String(err).includes('ENOENT')) {
				await writeFile(
					'.gitignore',
					['node_modules', '*.log', '*.dist.js', '.prop'].join('\r\n'),
				)
			} else {
				throw err
			}
		}
	}
}
