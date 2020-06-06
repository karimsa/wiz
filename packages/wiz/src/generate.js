import * as util from 'util'

const joinWords = words => {
	return words.reduce((text, str) => {
		if (str) {
			return text + str
		}
		return text
	}, '')
}

let state

const indent = () => {
	return (state.indent += '\t')
}
const unindent = () => {
	return (state.indent = state.indent.substr(0, state.indent.length - 1))
}

const generators = {
	Program(node) {
		return node.body.map(statement => {
			return generate(statement)
		}).join('\n')
	},

	Identifier(node) {
		return node.name
	},

	Literal(node) {
		return node.raw
	},

	VariableDeclaration(node) {
		return node.kind + ' ' + node.declarations.map(decl => {
			return generators.VariableDeclarator(decl)
		}).join(', ') + ';'
	},

	VariableDeclarator(node) {
		if (!node.init) {
			return generate(node.id)
		}
		return `${generate(node.id)} = ${generate(node.init)}`
	},

	CallExpression(node) {
		return `${generate(node.callee)}(${node.arguments.map(arg => generate(arg)).join(', ')})`
	},

	ArrowFunctionExpression(node) {
		let text = `((${node.params.map(p => generate(p))}) => ${generate(node.body)})`
		if (node.async) {
			return `async ${text}`
		}
		return text
	},

	ObjectExpression(node) {
		if (node.properties.length === 0) {
			return '{}'
		}
		indent()
		return joinWords([
			'{\n',
			node.properties.map(property => {
				switch (property.kind) {
					case 'init':
						return joinWords([
							state.indent,
							property.computed && '[',
							generate(property.key),
							property.computed && ']',
							': ',
							generate(property.value),
						])
	
					case 'set':
					case 'get': {
						indent()
						const body = generate(property.value.body)
						unindent()

						return joinWords([
							state.indent,
							property.kind,
							' ',
							generate(property.key),
							'(',
							generators.FunctionParams(property.value.params),
							') {\n',
							body,
							'\n',
							state.indent,
							'}',
						])
					}
	
					default:
						throw new Error(`Unsupported property type in ObjectExpression: ${property.kind}`)
				}
			}).join(',\n') + ',\n',
			unindent(),
			'}',
		])
	},

	AssignmentExpression(node) {
		return `${generate(node.left)} ${node.operator} ${generate(node.right)}`
	},

	MemberExpression(node) {
		if (node.computed) {
			return `${generate(node.object)}[${generate(node.property)}]`
		}
		return `${generate(node.object)}.${generate(node.property)}`
	},

	FunctionParams(params) {
		return params.map(param => generate(param)).join(', ')
	},

	BlockStatement(node) {
		return node.body.map(stmt => {
			return generate(stmt)
		}).join('\n')
	},

	FunctionDeclaration(node) {
		indent()
		const body = generate(node.body)
		unindent()
		return joinWords([
			state.indent,
			node.async && 'async ',
			'function',
			node.generator && '*',
			' ',
			node.id && generate(node.id),
			'(',
			generators.FunctionParams(node.params),
			') {\n',
			body,
			'\n',
			state.indent,
			'}\n',
		])
	},

	FunctionExpression(node) {
		return generators.FunctionDeclaration(node)
	},

	ReturnStatement(node) {
		return `${state.indent}return ${generate(node.argument, state)};`
	},

	LogicalExpression(node) {
		return `(${generate(node.left, state)} ${node.operator} ${generate(node.right, state)})`
	},

	ExpressionStatement(node) {
		return `${state.indent}${generate(node.expression, state)};`
	},

	ClassDeclaration(node) {
		indent()
		const body = generate(node.body)
		unindent()

		return joinWords([
			state.indent,
			node.superClass ?
				`class ${generate(node.id, state)} extends ${generate(node.superClass, state)} {` :
				`class ${generate(node.id, state)} {`,
			`\n`,
			body,
			state.indent,
			`}`,
		])
	},

	ClassBody(node) {
		return node.body.map(child => {
			return generate(child, state)
		}).join('\n')
	},

	MethodDefinition(node) {
		if (node.kind === 'constructor') {
			indent()
			const body = generate(node.value.body)
			unindent()
			return joinWords([
				state.indent,
				`constructor(`,
				generators.FunctionParams(node.value.params),
				`) {`,
				'\n',
				body,
				'\n',
				state.indent,
				'}\n',
			])
		}
		if (node.kind === 'get' || node.kind === 'set') {
			indent()
			const body = generate(node.value.body)
			unindent()
			return joinWords([
				state.indent,
				node.static && `static `,
				`${node.kind} `,
				node.async && `async `,
				node.generator && `* `,
				node.computed && `[`,
				generate(node.key),
				node.computed && `]`,
				`(`,
				generators.FunctionParams(node.value.params),
				`) {`,
				'\n',
				body,
				'\n',
				state.indent,
				'}\n',
			])
		}
		if (node.kind === 'method') {
			indent()
			const body = generate(node.value.body)
			unindent()
			return joinWords([
				state.indent,
				node.static && `static `,
				node.async && `async `,
				node.generator && `* `,
				node.computed && `[`,
				generate(node.key),
				node.computed && `]`,
				`(`,
				generators.FunctionParams(node.value.params),
				`) {`,
				'\n',
				body,
				'\n',
				state.indent,
				'}\n',
			])
		}

		throw new Error(`Unsupported method type: ${node.kind}`)
	},

	Super() {
		return 'super'
	},
	ThisExpression() {
		return 'this'
	},
}

export function generate(node) {
	if (!node) {
		throw new Error(`Node must be provided to generate`)
	}
	if (!node.type) {
		throw new Error(`Node type must be defined`)
	}
	if (node.type === 'Program') {
		state = { indent: '' }
	}
	const generator = generators[node.type]
	if (!generator) {
		throw new Error(`No generator defined for node of type ${node.type}`)
	}
	return generator(node)
}
