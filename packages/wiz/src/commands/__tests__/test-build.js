import { createVirtualNode, buildVirtualNode } from '../../__tests__/helpers'

async function transpile(input, expected) {
	const { text } = await buildVirtualNode({
		node: createVirtualNode({
			text: input,
		}),
	})
	expect(text).toEqual(expected)
}

describe('Builder', () => {
	// Added in Node v12.x
	describe('proposal-numeric-separator', () => {
		it('should remove separators', async () => {
			await transpile('1_000', '1000;')
			await transpile('0xAE_BE_CE', '0xaebece;')
			await transpile('0b1010_0001_1000_0101', '0b1010000110000101;')
			await transpile('0o0_6_6_6', '0o0666;')
		})
	})

	// Added in Node v10.x
	describe('proposal-json-strings', () => {
		it('should expand UTF-8 chars', async () => {
			await transpile(`"before\u2028after"`, `'before\\u2028after';`)
			await transpile(`"before\u2029after"`, `'before\\u2029after';`)
		})
	})

	// Not added to Node LTS
	describe('proposal-class-properties', () => {
		it('should transpile instance props (no constructor)', async () => {
			await transpile(
				[
					`class Hello {`,
					`	name = 'world'`,
					`}`,
				].join('\n'),
				[
					`class Hello {`,
					`\tconstructor() {`,
					`\t\tthis.name = 'world';`,
					`\t}`,
					`}`,
				].join('\n'),
			)
			await transpile(
				[
					`class Hello extends Other {`,
					`	name = 'world'`,
					`}`,
				].join('\n'),
				[
					`class Hello extends Other {`,
					`\tconstructor() {`,
					`\t\tsuper();`,
					`\t\tthis.name = 'world';`,
					`\t}`,
					`}`,
				].join('\n'),
			)
		})
		it('should transpile instance props (with constructor)', async () => {
			await transpile(
				[
					`class Hello {`,
					`	name = 'world'`,
					`	constructor() {`,
					`		this.c = 1`,
					`	}`,
					`}`,
				].join('\n'),
				[
					`class Hello {`,
					`	constructor() {`,
					`		this.name = 'world';`,
					`		this.c = 1;`,
					`	}`,
					`}`,
				].join('\n'),
			)
			await transpile(
				[
					`class Hello extends Other {`,
					`	name = 'world'`,
					`	constructor() {`,
					`		super()`,
					`		this.c = 1`,
					`	}`,
					`}`,
				].join('\n'),
				[
					`class Hello extends Other {`,
					`	constructor() {`,
					`		super();`,
					`		this.name = 'world';`,
					`		this.c = 1;`,
					`	}`,
					`}`,
				].join('\n'),
			)
		})
		it('should transpile static props', async () => {
			await transpile(
				[
					`class Hello {`,
					`	static test = 1`,
					`}`,
				].join('\n'),
				[
					`const Hello = Object.defineProperties(class Hello {`,
					`}, {`,
					`	test: {`,
					`		value: 1,`,
					`		writable: false,`,
					`	},`,
					`});`,
				].join('\n'),
			)
		})
		it('should handle computed props', async () => {
			await transpile(
				[
					`class Hello extends Other {`,
					`	[name()] = 'world'`,
					`}`,
				].join('\n'),
				[
					`class Hello extends Other {`,
					`	constructor() {`,
					`		super();`,
					`		this[name()] = 'world';`,
					`	}`,
					`}`,
				].join('\n'),
			)
		})
		it('should transpile nested class props', async () => {
			await transpile(
				[
					`class Outer extends Hello {`,
					`	constructor() {`,
					`		super()`,
					`		class Inner {`,
					`			[super.toString()] = 'hello'`,
					`		}`,
					`	}`,
					`}`,
				].join('\n'),
				[
					`class Outer extends Hello {`,
					`	constructor() {`,
					`		super();`,
					`		class Inner {`,
					`			constructor() {`,
					`				this[super.toString()] = 'hello';`,
					`			}`,
					`		}`,
					`	}`,
					`}`,
				].join('\n'),
			)
		})
		it('should transpile arrow fn props', async () => {
			await transpile(
				[
					`class Foo {`,
					`	static fn = () => console.log(this)`,
					`}`,
				].join('\n'),
				[
					`const Foo = Object.defineProperties(class Foo {`,
					`}, {`,
					`	fn: {`,
					`		value: (() => console.log(this)),`,
					`		writable: false,`,
					`	},`,
					`});`,
				].join('\n'),
			)
			await transpile(
				[
					`class Foo {`,
					`	fn = () => console.log(this)`,
					`}`,
				].join('\n'),
				[
					`class Foo {`,
					`	constructor() {`,
					`		this.fn = (() => console.log(this));`,
					`	}`,
					`}`,
				].join('\n'),
			)
		})
	})

	describe('ES2015', () => {
		it('should transpile a single named import', async () => {
			await transpile(`
				import { a } from 'b'
				export const c = () => a
			`, [
				`function _interopDefaultImport(value) {`,
				`	return (value.default || value);`,
				`}`,
				`const {`,
				`	a: a,`,
				`} = require("b")`,
				`const c = exports.c = (() => a)`,
			].join('\n'))
		})
		it('should transpile multiple named imports', async () => {
			await transpile(`
				import { a, b, c } from 'b'
				export const d = 1
			`, [
				`function _interopDefaultImport(value) {`,
				`	return (value.default || value);`,
				`}`,
				`const {`,
				`	a: a,`,
				`} = require("b")`,
				`const {`,
				`	b: b,`,
				`} = require("b")`,
				`const {`,
				`	c: c,`,
				`} = require("b")`,
				`const d = exports.d = 1`,
			].join('\n'))
		})
		it('should transpile default imports', async () => {
			await transpile(`
				import a from 'b'
				export const d = a
			`, [
				`function _interopDefaultImport(value) {`,
				`	return (value.default || value);`,
				`}`,
				`const a = _interopDefaultImport(require("b"))`,
				`const d = exports.d = a`,
			].join('\n'))
		})
	})
})
