import { spawnSync } from 'child_process'
import * as Module from 'module'

import * as babelParser from '@babel/parser'
import babelTraverse from '@babel/traverse'
import createDebug from 'debug'

import { readFile, writeFile, stat } from '../fs'
import { findSourceFiles } from '../glob'

const debug = createDebug('wiz:get')
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

async function findPackageManager(dev) {
	if (await exists('./yarn.lock')) {
		return ['yarn', dev ? ['add', '--dev'] : ['add']]
	}
	if (await exists('./pnpm-lock.yaml')) {
		return ['pnpm', dev ? ['add', '--dev'] : ['add']]
	}
	return ['npm', ['install', dev ? '--save-dev' : '--save']]
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
		if (error.code !== 'ENOENT') {
			throw error
		}
	}

	await writeFile('./package.json', '{}')
	return {
		dependencies: new Set(),
		devDependencies: new Set(),
	}
}

function markDependency({
	modulePath,
	sourceType,
	foundImports,
	foundDevImports,
	dependencies,
	devDependencies,
}) {
	if (modulePath[0] === '.' || modulePath[0] === '/') {
		return
	}

	const firstSlash = modulePath.indexOf('/')
	if (modulePath[0] === '@') {
		const nextSlash = modulePath.indexOf('/', firstSlash + 1)
		if (nextSlash > -1) {
			modulePath = modulePath.substr(0, nextSlash)
		}
	} else if (modulePath[0] !== '.' && firstSlash > -1) {
		modulePath = modulePath.substr(0, firstSlash)
	}

	if (!modulePath) {
		throw new Error(`Module path is required`)
	}

	if (builtinModules.has(modulePath)) {
		return
	}

	if (sourceType === 'source') {
		if (!dependencies.has(modulePath) && !foundImports.has(modulePath)) {
			debug(`Found missing dependency: ${modulePath} (in ${sourceType} file)`)
			foundImports.add(modulePath)
		}
	} else {
		if (!devDependencies.has(modulePath) && !foundDevImports.has(modulePath)) {
			debug(`Found missing dependency: ${modulePath} (in ${sourceType} file)`)
			foundDevImports.add(modulePath)
		}
	}
}

async function installPackages(pkgs, dev = false) {
	const [cmd, args] = await findPackageManager(dev)
	debug(`Installing with: ${cmd}`)
	const { status, error } = spawnSync(cmd, [...args, ...pkgs], {
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

export async function getCommand() {
	const { dependencies = [], devDependencies = [] } = await loadPackageJSON()
	const foundImports = new Set()
	const foundDevImports = new Set()

	for await (const { type, file } of findSourceFiles({
		directory: './src',
		cache: Object.create(null),
	})) {
		const code = await readFile(file, 'utf8')
		const ast = babelParser.parse(code, {
			sourceType: 'unambiguous',
		})

		babelTraverse(ast, {
			ImportDeclaration(path) {
				markDependency({
					modulePath: path.node.source.value,
					sourceType: type,
					foundImports,
					foundDevImports,
					dependencies,
					devDependencies,
				})
			},
			CallExpression(path) {
				if (
					path.get('callee').isIdentifier() &&
					path.node.callee.name === 'require' &&
					path.get('arguments').length === 1 &&
					path.get('arguments')[0].isStringLiteral()
				) {
					markDependency({
						modulePath: path.node.arguments[0].value,
						sourceType: type,
						foundImports,
						foundDevImports,
						dependencies,
						devDependencies,
					})
				}
			},
		})
	}

	debug(
		`Found ${foundImports.size} dependencies, and ${foundDevImports.size} devDependencies.`,
	)

	for (const mod of foundDevImports) {
		if (foundImports.has(mod)) {
			foundDevImports.delete(mod)
		}
	}

	if (foundImports.size > 0) {
		await installPackages(foundImports)
	}
	if (foundDevImports.size > 0) {
		await installPackages(foundDevImports, true)
	}
}
