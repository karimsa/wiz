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
	describe.only('proposal-numeric-separator', () => {
		it('should remove separators', async () => {
			await transpile('1_000', '1000;')
			await transpile('0xAE_BE_CE', '0xaebece;')
			await transpile('0b1010_0001_1000_0101', '0b1010000110000101;')
			await transpile('0o0_6_6_6', '0o0666;')
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
