import { lintFileNode } from '../lint'
import { linter, createVirtualNode } from '../../__tests__/helpers'

describe('Linter', () => {
	it('should format files automatically', async () => {
		const { text, summary, dirty } = await lintFileNode({
			linter,
			node: createVirtualNode({
				text: `export function f(a){let b=a;return b}`,
			}),
		})
		expect(summary.messages).toHaveLength(0)
		expect(dirty).toBe(true)
		expect(text).toEqual([
			'export function f(a) {',
			'	let b = a',
			'	return b',
			'}',
			'',
		].join('\n'))
	})
})
