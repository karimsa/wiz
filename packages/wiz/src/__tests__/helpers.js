import { parseSource } from '../walk'
import { createLinter, lintFileNode } from '../commands/lint'
import { buildFileNode } from '../commands/bundle'

export const linter = createLinter({
	cwd: '/app',
})

export async function buildVirtualNode({ node }) {
	const lintResult = await lintFileNode({
		node,
		linter,
	})
	return buildFileNode({
		node,
		lintResult,
	})
}

export const createVirtualNode = ({ basename = 'sample.js', text, ...props }) => ({
	...props,
	basename,
	relpath: './src/' + basename,
	abspath: '/app/src/' + basename,
	mtime: 0,
	isModified: true,
	parseSource() {
		const ast = parseSource(text)
		return { text, ast }
	},
})
