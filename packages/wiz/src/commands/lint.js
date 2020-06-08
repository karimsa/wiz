import { Linter } from 'eslint/lib/linter'
import stylish from 'eslint/lib/cli-engine/formatters/stylish'
import SourceCodeFixer from 'eslint/lib/linter/source-code-fixer'

import * as fs from '../fs'
import { walkSources, parseSource } from '../walk'
import { openCache } from '../cache'
import { eslintConfig, definePlugins } from '../lint-config'
import { isCI, isTestEnv } from '../config'
import { ttywrite } from '../utils'

const applyFixes = SourceCodeFixer.applyFixes
SourceCodeFixer.applyFixes = (text, ...args) => {
    return applyFixes.call(null, typeof text === 'object' ? text.text : text, ...args)
}

export function createLinter(options) {
    const linter = new Linter(options)
    definePlugins(linter)
    return linter
}

export async function lintFileNode({ node, linter, fix }) {
	let { text, ast } = await node.parseSource()
	let dirty = false

    eslintConfig.parser.definition.parse = (source) => {
		if (source !== text) {
			dirty = true
			text = source
			ast = parseSource(source)
		}

		return ast
	}

	try {
		const { fixed, output, messages } = linter.verifyAndFix(text, eslintConfig, {
			allowInlineConfig: false,
			filename: node.basename,
			fix: fix || !isCI,
			reportUnusedDisableDirectives: true,
		})

		const summary = {
			messages,
			filePath: node.relpath,
			errorCount: 0,
			warningCount: 0,
			fixableErrorCount: 0,
			fixableWarningCount: 0,
		}
		for (const msg of messages) {
			if (msg.fatal || msg.severity === 2) {
				summary.errorCount++
				if (msg.fix) {
					summary.fixableErrorCount++
				}
			} else {
				summary.warningCount++
				if (msg.fix) {
					summary.fixableWarningCount++
				}
			}
		}

		return {
			dirty: dirty || fixed,
			output,
			summary,
			text,
			ast,
		}
	} catch (error) {
		if (error.currentNode) {
			console.warn({
				node,
				currentNode: error.currentNode,
				ast,
				tokens: ast.tokens,
			})
		}
		throw error
	}
}

export async function* lintDirectory({ rootDir, lintCache }) {
	lintCache = lintCache || await openCache('lint')
    const linter = createLinter({ cwd: rootDir })

    for await (const node of walkSources(rootDir)) {
        if (!isTestEnv) {
            ttywrite(node.relpath)
        }

        const cachedResult = lintCache.get(node.relpath, node.mtime)
        if (cachedResult) {
            yield { node, result: cachedResult }
        } else {
            const result = await lintFileNode({
                linter,
                node,
            })
            yield { node, result }
        }
    }
}

export async function lintCommand({ rootDir }) {
	const lintCache = await openCache('lint')
	let hasErrors = false
	const summary = []
	const writes = []

    for await (const { node, result } of lintDirectory({ rootDir, lintCache })) {
        if (result.dirty) {
			writes.push([node, result.output])
		}

		summary.push(result.summary)
		hasErrors = hasErrors || result.summary.errorCount > 0
        lintCache.set(node.relpath, node.mtime, result)
	}

	if (hasErrors) {
		ttywrite('')
		process.stdout.write(stylish(summary))
	} else {
		for (const [node, output] of writes) {
			ttywrite(node.relpath + '\n')
            await fs.writeFile(node.abspath, output)
		}
	}
}
