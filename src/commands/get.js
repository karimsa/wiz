import { spawnSync } from 'child_process'
import * as Module from 'module'

import * as babelParser from '@babel/parser'
import babelTraverse from '@babel/traverse'
import createDebug from 'debug'

import { readFile, writeFile, stat } from '../fs'
import { findSourceFiles } from '../glob'
import { isCI } from '../config'

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
		return ['pnpm', ['add', dev ? '--save-dev' : '--save-prod']]
	}
	return ['npm', ['install', dev ? '--save-dev' : '--save-prod']]
}

async function loadPackageJSON() {
	try {
		const { dependencies = {}, devDependencies = {} } = JSON.parse(
			await readFile('./package.json', 'utf8'),
		)

		debug(`found existing package.json`)
		return {
			dependencies: new Set(Object.keys(dependencies)),
			devDependencies: new Set(Object.keys(devDependencies)),
		}
	} catch (error) {
		if (error.code !== 'ENOENT') {
			throw error
		}
	}

	debug(`package.json is missing, creating empty one`)
	await writeFile('./package.json', '{}')
	return {
		dependencies: new Set(),
		devDependencies: new Set(),
	}
}

function markDependency({
	modulePath,
	sourceType,
	sourceFile,
	foundImports,
	foundDevImports,
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
		if (!foundImports.has(modulePath)) {
			debug(
				`Found dependency: ${modulePath} (in ${sourceType} file - ${sourceFile})`,
			)
			foundImports.add(modulePath)
		}
	} else {
		if (!foundDevImports.has(modulePath)) {
			debug(
				`Found dependency: ${modulePath} (in ${sourceType} file - ${sourceFile})`,
			)
			foundDevImports.add(modulePath)
		}
	}
}

async function installPackages(pkgs, dev = false) {
	const [cmd, args] = await findPackageManager(dev)
	pkgs.forEach(pkg => {
		args.push(pkg)
	})

	debug(`Installing with: %O`, { cmd, args })
	const { status, error } = spawnSync(cmd, args, {
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
	debug(`Checking CI status: %O`, isCI)
	if (isCI) {
		throw new Error(`Cannot use 'wiz get' in CI environments`)
	}

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
					sourceFile: file,
					foundImports,
					foundDevImports,
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
						sourceFile: file,
						foundImports,
						foundDevImports,
					})
				}
			},
		})
	}

	debug(
		`Found ${foundImports.size} dependencies, and ${foundDevImports.size} devDependencies.`,
	)

	// Deps that are mentioned in both dev and normal are
	// just production deps
	for (const mod of foundDevImports) {
		if (foundImports.has(mod)) {
			foundDevImports.delete(mod)
		}
	}

	// Figuring out what is actually missing
	for (const mod of dependencies) {
		foundImports.delete(mod)
	}
	for (const mod of devDependencies) {
		foundDevImports.delete(mod)
	}

	debug(`${foundImports.size} dependencies are missing`)
	debug(`${foundDevImports.size} devDependencies are missing`)

	if (foundImports.size > 0) {
		await installPackages(foundImports)
	}
	if (foundDevImports.size > 0) {
		await installPackages(foundDevImports, true)
	}
}
