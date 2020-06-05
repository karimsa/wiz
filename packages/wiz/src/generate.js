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
		if (typeof node.value === 'number') {
			return node.raw.replace(/_/g, '')
		}
		return node.raw
	},

	VariableDeclaration(node) {
		return node.kind + ' ' + node.declarations.map(decl => {
			return generators.VariableDeclarator(decl)
		}).join(', ')
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
		return `{\n${node.properties.map(property => {
			switch (property.kind) {
				case 'init':
					if (property.computed) {
						return `${state.indent}\t[${generate(property.key)}]: ${generate(property.value)}`
					}
					return `${state.indent}\t${generate(property.key)}: ${generate(property.value)}`

				case 'set':
				case 'get':
					return `${state.indent}\t${property.kind} ${generate(property.key)} {\n${generate(property.value)}}`

				default:
					throw new Error(`Unsupported property type in ObjectExpression: ${property.kind}`)
			}
		}).join(',\n')},\n}`
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
		let space = indent()
		const str = node.body.map(statement => {
			return space + generate(statement)
		}).join('\n') + '\n'
		unindent()
		return str
	},

	FunctionDeclaration(node) {
		return joinWords([
			node.async && ' async',
			'function',
			node.generator && '*',
			' ',
			generate(node.id),
			'(',
			generators.FunctionParams(node.params),
			') {\n',
			generate(node.body),
			'}',
		])
	},

	ReturnStatement(node, state) {
		return `return ${generate(node.argument, state)};`
	},

	LogicalExpression(node, state) {
		return `(${generate(node.left, state)} ${node.operator} ${generate(node.right, state)})`
	},

	ExpressionStatement(node, state) {
		return `${generate(node.expression, state)};`
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
