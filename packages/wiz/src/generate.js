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
		console.warn(node)
		return JSON.stringify(node.value)
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
}

export function generate(node) {
	const generator = generators[node.type]
	if (!generator) {
		throw new Error(`No generator defined for node of type ${node.type}`)
	}
	return generator(node)
}
