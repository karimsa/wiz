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
const literal = ({ value, raw }) => ({
	type: 'Literal',
	value,
	raw,
})
const booleanLiteral = value => literal({
	value,
	raw: String(value),
})
const expressionStatement = expression => ({
	type: 'ExpressionStatement',
	expression,
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
const objectProperty = ({ method = false, shorthand = false, computed = false, key, kind = 'init', value }) => ({
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
const functionExpression = ({ id = null, params = [], body = [], async = false, generator = false }) => ({
	type: 'FunctionExpression',
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
const thisExpression = () => ({
	type: 'ThisExpression',
})
const superExpression = () => ({
	type: 'Super',
})
const methodDefinition = ({
	kind,
	'static': isStatic = false,
	computed = false,
	key,
	value,
}) => ({
	type: 'MethodDefinition',
	kind,
	static: isStatic,
	computed,
	key,
	value,
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

function replaceNode(target, replacement) {
	if (target.parent.type === 'ExpressionStatement') {
		target.parent.expression = replacement
	} else if (target.parent.body) {
		replaceFromList(target, target.parent.body, replacement)
	} else {
		throw new Error(`Unsure how to replace node within ${target.type} parent`)
	}
}

function iterateList(list, fn) {
	const removed = new Set()
	for (let i = 0; i < list.length; i++) {
		fn(list[i], function() {
			removed.add(i)
		})
	}
	return list.filter((_, i) => {
		return !removed.has(i)
	})
}

const transpilers = Object.freeze({
	Program(node, state) {
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
	ImportDeclaration(node, state, ancestors) {
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
	ExportNamedDeclaration(node, _, ancestors) {
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
	ClassDeclaration(node) {
		const staticFieldInitializers = []
		const fieldInitializers = []
		let constructorDefn

		const classBody = node.body

		classBody.body = iterateList(classBody.body, (child, removeChild) => {
			if (child.type === 'FieldDefinition') {
				if (child.static) {
					staticFieldInitializers.push(
						objectProperty({
							key: child.key,
							computed: child.computed,
							value: objectExpression([
								objectProperty({
									key: identifier('value'),
									value: child.value,
								}),
								objectProperty({
									key: identifier('writable'),
									value: booleanLiteral(false),
								}),
							]),
						}),
					)
				} else {
					fieldInitializers.push(
						expressionStatement(
							assignmentExpression({
								left: memberExpression({
									object: thisExpression(),
									property: child.key,
									computed: child.computed,
								}),
								operator: '=',
								right: child.value,
							}),
						),
					)
				}

				removeChild()
			} else if (child.type === 'MethodDefinition' && child.kind === 'constructor') {
				constructorDefn = child
			}
		})

		if (constructorDefn) {
			if (classBody.parent.superClass) {
				const firstStatement = constructorDefn.value.body.body[0]
				if (
					!firstStatement ||
					firstStatement.type !== 'ExpressionStatement' ||
					firstStatement.expression.type !== 'CallExpression' ||
					firstStatement.expression.callee.type !== 'Super'
				) {
					throw Object.assign(new Error(`Unexpected ${firstStatement.type} in extended class, first line in constructor should be a call to super`), {
						firstStatement,
					})
				}

				constructorDefn.value.body.body.splice(1, 0, ...fieldInitializers)
			} else {
				fieldInitializers.forEach(init => {
					constructorDefn.value.body.body.unshift(init)
				})
			}
		} else if (fieldInitializers.length > 0) {
			if (classBody.parent.superClass) {
				fieldInitializers.unshift(
					expressionStatement(
						callExpression({
							callee: superExpression(),
						}),
					),
				)
			}
			classBody.body.push(
				methodDefinition({
					kind: 'constructor',
					key: identifier('constructor'),
					value: functionExpression({
						body: blockStatement(fieldInitializers),
					}),
				}),
			)
		}

		if (staticFieldInitializers.length > 0) {
			const classExpr = callExpression({
				callee: memberExpression({
					object: identifier('Object'),
					property: identifier('defineProperties'),
				}),
				args: [
					node,
					objectExpression(staticFieldInitializers),
				],
			})

			if (node.type === 'ClassDeclaration') {
				replaceNode(node, variableDeclaration({
					kind: 'const',
					declarations: [
						variableDeclarator({
							id: node.id,
							init: classExpr,
						}),
					],
				}))
			} else {
				replaceNode(node, classExpr)
			}
		}
	},
})

const hasNoChildren = () => {}

const traverseChildren = Object.freeze({
	...acornWalk.base,

	ClassDeclaration(node, _, visit) {
		visit(node.body)
	},
	ClassBody(node, _, visit) {
		for (const child of node.body) {
			visit(child)
		}
	},
	FieldDefinition: hasNoChildren,
})

export function transpileAst(ast) {
	if (!ast) {
		throw new Error(`A valid ast is required to transpile`)
	}
	acornWalk.ancestor(ast, transpilers, traverseChildren, {
		usesDefaultImports: false,
	})
	return ast
}
