import * as path from 'path'
import * as acornWalk from 'acorn-walk'

import { lintDirectory } from './lint'
import { transpileAst } from '../build'
import { generate } from '../generate'

export function buildFileNode({ lintResult }) {
	const ast = transpileAst(lintResult.ast)
	return {
		ast,
		text: generate(ast),
	}
}

export async function* buildDirectory({ rootDir, buildCache }) {
	buildCache = buildCache || await openCache('build')

	for await (const { node, result: lintResult } of lintDirectory({ rootDir })) {
		yield {
			node,
			lintResult,
			output: buildFileNode({
				node,
				lintResult,
			}),
		}
	}
}

// TODO: Bundle stuff
export async function createBundle({ rootDir, entryNode }) {
	const depGraph = new Map()
	const externalDeps = []
	let moduleText = ``

	async function addNodeToBundle(fileNode) {
		const deps = []
		const resolvedDeps = {}
		const addDep = node => {
			if (node.type !== 'Literal') {
				throw new Error(`Unexpected ${node.type} in import/require`)
			}
			if (node.value[0] === '.' || node.value[0] === '/') {
				const nodePath = path.resolve(path.dirname(fileNode.relpath), node.value)
				resolvedDeps[node.value] = nodePath
				deps.push(nodePath)
			} else {
				externalDeps.push(node.value)
			}
		}
		depGraph.set(fileNode.relpath, deps)

		const { text, ast } = await fileNode.parseSource()

		// ...

		for (const node of ast.body) {
			if (node.type === 'ImportDeclaration') {
				addDep(node.source)
			}
		}

		acornWalk.simple(ast, {
			CallExpression(node) {
				if (node.callee.name === 'require') {
					addDep(node.arguments[0])
				}
			},
		})

		// path.resolve(fileNode.abspath)

		moduleText += `define(
	'${fileNode.abspath}',
	${JSON.stringify(deps)},
	${JSON.stringify(resolvedDeps)},
	(require, module, exports) => {
		${text}
	},
)\n`
		console.warn({ file: fileNode.abspath, deps })
	}

	await addNodeToBundle(entryNode)

	console.warn(moduleText)
}
