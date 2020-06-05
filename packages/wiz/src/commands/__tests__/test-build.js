import { createVirtualNode, buildVirtualNode } from '../../__tests__/helpers'

describe('Builder', () => {
	describe('ES2015', () => {
		it('should transpile imports', async () => {
			const { text } = await buildVirtualNode({
				node: createVirtualNode({
					text: `
					import { a } from 'b'
					export const c = () => a
					`,
				}),
			})
			expect(text).toEqual([
				`const { a } = require('b')`,
				`const c = exports.c = () => a`,
				``,
			].join('\n'))
		})
	})
})
