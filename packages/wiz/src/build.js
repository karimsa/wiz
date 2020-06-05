import * as acornWalk from 'acorn-walk'

const callExpression = ({ callee, args = [], optional = false }) => ({
	type: 'CallExpression',
	callee,
	arguments: args,
	optional,
})
const variableDeclaration = ({ kind, declarations }) => ({
	type: 'VariableDeclaration',
	kind,
	declarations,
})
const variableDeclarator = ({ id, init }) => ({
	type: 'VariableDeclarator',
	id,
	init,
})
const identifier = name => ({
	type: 'Identifier',
	name,
})
const literal = value => ({
	type: 'Literal',
	value,
})
const assignmentExpression = ({ operator, left, right }) => ({
	type: 'AssignmentExpression',
	operator,
	left,
	right,
})
const memberExpression = ({ object, property, computed }) => ({
	type: 'MemberExpression',
	object,
	property,
	computed: Boolean(computed),
})
const logicalExpression = ({ left, operator, right }) => ({
	type: 'LogicalExpression',
	left,
	operator,
	right,
})
const objectExpression = (properties = []) => ({
	type: 'ObjectExpression',
	properties,
})
const objectProperty = ({ method = false, shorthand = false, computed = false, key, kind, value }) => ({
	type: 'Property',
	key,
	kind,
	value,
	method,
	shorthand,
	computed,
})
const functionDeclaration = ({ id, params = [], body = [], async = false, generator = false }) => ({
	type: 'FunctionDeclaration',
	id,
	params,
	body,
	async,
	generator,
})
const blockStatement = body => ({
	type: 'BlockStatement',
	body,
})
const returnStatement = argument => ({
	type: 'ReturnStatement',
	argument,
})

function replaceFromList(node, body, replacement) {
	for (let i = 0; i < body.length; i++) {
		if (node === body[i]) {
			body[i] = replacement
			break
		}
	}
}

function replaceFromListWithMultiple(node, body, replacements) {
	for (let i = 0; i < body.length; i++) {
		if (node === body[i]) {
			body.splice(i, 1, ...replacements)
			break
		}
	}
}

const transpilers = Object.freeze({
	Program: {
		exit({node, state}) {
			if (state.usesDefaultImports) {
				node.body.unshift(functionDeclaration({
					id: identifier('_interopDefaultImport'),
					params: [identifier('value')],
					body: blockStatement([
						returnStatement(logicalExpression({
							left: memberExpression({
								object: identifier('value'),
								property: identifier('default'),
							}),
							operator: '||',
							right: identifier('value'),
						})),
					]),
				}))
			}
		},
	},
	ImportDeclaration({node, state, ancestors}) {
		const replacements = []

		for (const specifier of node.specifiers) {
			if (specifier.type === 'ImportDefaultSpecifier') {
				state.usesDefaultImports = true
				replacements.push(
					variableDeclaration({
						kind: 'const',
						declarations: [
							variableDeclarator({
								id: specifier.local,
								init: callExpression({
									callee: identifier('_interopDefaultImport'),
									args: [
										callExpression({
											callee: identifier('require'),
											args: [node.source],
										}),
									],
								}),
							}),
						],
					}),
				)
			} else if (specifier.type === 'ImportSpecifier') {
				replacements.push(
					variableDeclaration({
						kind: 'const',
						declarations: [
							variableDeclarator({
								id: objectExpression([
									objectProperty({
										key: specifier.imported,
										value: specifier.local || specifier.imported,
										kind: 'init',
									}),
								]),
								init: callExpression({
									callee: identifier('require'),
									args: [node.source],
								}),
							}),
						],
					}),
				)
			} else {
				throw new Error(specifier.type)
			}
		}

		replaceFromListWithMultiple(node, ancestors[ancestors.length - 2].body, replacements)
	},
	ExportNamedDeclaration({node, ancestors}) {
		const replacements = []

		if (node.declaration) {
			for (const declaration of node.declaration.declarations) {
				declaration.init = assignmentExpression({
					operator: '=',
					left: memberExpression({
						object: identifier('exports'),
						property: declaration.id,
						computed: false,
					}),
					right: declaration.init,
				})
				replacements.push(
					variableDeclaration({
						kind: 'const',
						declarations: [
							declaration,
						],
					}),
				)
			}
		} else {
			throw new Error(`Unsupported export type ${node.type}`)
		}

		replaceFromListWithMultiple(node, ancestors[ancestors.length - 2].body, replacements)
	},
})

export function transpileAst(ast) {
	if (!ast) {
		throw new Error(`A valid ast is required to transpile`)
	}

	const ancestors = []
	const state = {
		usesDefaultImports: false,
	}
	function visitNode(node) {
		ancestors.push(node)

		if (transpilers[node.type]) {
			const enter = typeof transpilers[node.type] === 'function' ? transpilers[node.type] : transpilers[node.type].enter
			const exit = typeof transpilers[node.type] === 'function' ? null : transpilers[node.type].exit

			if (enter) {
				enter({ node, state, ancestors })
			}
			acornWalk.base[node.type](node, null, visitNode)
			if (exit) {
				exit({ node, state, ancestors })
			}
		} else {
			acornWalk.base[node.type](node, null, visitNode)
		}

		ancestors.pop()
	}
	visitNode(ast)

	return ast
}
