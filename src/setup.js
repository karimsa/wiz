/**
 * @file src/setup.js
 * @copyright Karim Alibhai. All rights reserved.
 */

import * as path from 'path'

import { stat, mkdir, readFile, writeFile } from './fs'
import { mainDirectory } from './config'

export async function setup() {
	try {
		await stat(mainDirectory)
	} catch (err) {
		await mkdir(mainDirectory)

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

			if (!gitignore.includes(path.basename(mainDirectory))) {
				gitignoreChanged = true
				gitignore.push(path.basename(mainDirectory))
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
					[
						'node_modules',
						'*.log',
						'*.dist.js',
						path.basename(mainDirectory),
					].join('\r\n'),
				)
			} else {
				throw err
			}
		}

		try {
			await stat('./.npmignore')
		} catch (err) {
			await writeFile(
				'./.npmignore',
				['!*.dist.js', '.circleci', '.wiz', 'src', 'tests'].join('\r\n'),
			)
		}
	}
}
