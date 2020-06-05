import { lintFileNode } from '../lint'
import { linter, createVirtualNode } from '../../__tests__/helpers'

describe('Linter', () => {
	it('should format files automatically', async () => {
		const { text } = await lintFileNode({
			linter,
			node: createVirtualNode({
				text: `function f(a){let b=a;return b}`,
			}),
		})
		expect(text).toEqual([
			'function f(a) {',
			'	let b = a',
			'	return b',
			'}',
			'',
		].join('\n'))
	})
})
