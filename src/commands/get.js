import { spawnSync } from 'child_process'
import * as Module from 'module'

import * as babelParser from '@babel/parser'
import babelTraverse from '@babel/traverse'
import createDebug from 'debug'

import { readFile, writeFile, stat } from '../fs'
import { findSourceFiles } from '../glob'

const debug = createDebug('wiz')
const builtinModules = new Set(Module.builtinModules)

async function exists(file) {
	try {
		await stat(file)
	} catch (error) {
		if (error.code === 'ENOENT') {
			return false
		}
		throw error
	}
	return true
}

async function findPackageManager() {
	if (await exists('./yarn.lock')) {
		return ['yarn', ['add']]
	}
	if (await exists('./pnpm-lock.yaml')) {
		return ['pnpm', ['add']]
	}
	return ['npm', ['install', '--save']]
}

async function loadPackageJSON() {
	try {
		const { dependencies = {}, devDependencies = {} } = JSON.parse(
			await readFile('./package.json', 'utf8'),
		)
		return {
			dependencies: new Set(Object.keys(dependencies)),
			devDependencies: new Set(Object.keys(devDependencies)),
		}
	} catch (error) {
		if (error.code !== 'EEXISTS') {
			throw error
		}
	}

	await writeFile('./package.json', '{}')
	return {
		dependencies: new Set(),
		devDependencies: new Set(),
	}
}

function markDependency({ modulePath, foundImports, dependencies }) {
	if (!modulePath) {
		throw new Error(`Module path is required`)
	}
	if (
		!builtinModules.has(modulePath) &&
		!dependencies.has(modulePath) &&
		!foundImports.has(modulePath)
	) {
		debug(`Found missing dependency: ${modulePath}`)
		foundImports.add(modulePath)
	}
}

export async function getCommand() {
	const { dependencies = [], devDependencies = [] } = await loadPackageJSON()
	const foundImports = new Set()

	for await (const { file } of findSourceFiles({
		directory: './src',
		cache: Object.create(null),
	})) {
		const code = await readFile(file, 'utf8')
		const ast = babelParser.parse(code, {
			sourceType: 'unambiguous',
		})

		babelTraverse(ast, {
			ImportDeclaration(path) {
				const modulePath = path.node.source.value
				const firstSlash = modulePath.indexOf('/')

				if (modulePath[0] === '@') {
					const nextSlash = modulePath.indexOf('/', firstSlash + 1)

					markDependency({
						modulePath:
							nextSlash === -1 ? modulePath : modulePath.substr(0, nextSlash),
						foundImports,
						dependencies,
						devDependencies,
					})
				} else if (modulePath[0] !== '.') {
					markDependency({
						modulePath:
							firstSlash === -1 ? modulePath : modulePath.substr(0, firstSlash),
						foundImports,
						dependencies,
						devDependencies,
					})
				}
			},
		})
	}

	debug(`Found ${foundImports.size} undocumented dependencies.`)

	if (foundImports.size > 0) {
		const [cmd, args] = await findPackageManager()
		debug(`Installing with: ${cmd}`)
		const { status, error } = spawnSync(cmd, [...args, ...foundImports], {
			stdio: 'inherit',
			shell: true,
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
}
