import del from 'del'

import { getCommand } from '../get'
import { describe, it, expect, fixture } from '../../__tests__/testing'
import { readFile, stat } from '../../fs'

describe('wiz get', () => {
	it('should distinguish between deps and devDeps', async () => {
		const oldCwd = process.cwd()
		process.chdir(fixture('get-deps'))

		try {
			await del(['./node_modules', './package.json', './package-lock.json'])
			await getCommand()

			const pkgJSON = JSON.parse(await readFile('./package.json', 'utf8'))
			expect(Object.keys(pkgJSON.dependencies)).toEqual(['lodash'])
			expect(Object.keys(pkgJSON.devDependencies)).toEqual(['supertest'])
		} finally {
			process.chdir(oldCwd)
		}
	}, 7e3)

	it('should support using yarn', async () => {
		const oldCwd = process.cwd()
		process.chdir(fixture('yarn-deps'))

		try {
			await del(['./node_modules', './package.json', './package-lock.json'])
			await getCommand()

			const pkgJSON = JSON.parse(await readFile('./package.json', 'utf8'))
			expect(Object.keys(pkgJSON.dependencies)).toEqual(['lodash'])
			expect(Object.keys(pkgJSON.devDependencies)).toEqual(['supertest'])

			try {
				expect(await stat('./package-lock.json')).not.toBeDefined()
			} catch (error) {
				if (error.code !== 'ENOENT') {
					throw error
				}
			}
		} finally {
			process.chdir(oldCwd)
		}
	}, 7e3)
})
