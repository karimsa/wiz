import * as path from 'path'

import * as fs from './fs'
import { openCache } from './cache'
import { isTestEnv } from './config'
import * as meriyah from '../../meriyah'

async function readdir(rootDir, dir, dirStat) {
    const cache = await openCache('readdir')
    const cachedValue = cache.get(dir, dirStat.mtime)
    if (cachedValue) {
        return cachedValue
    }

    const files = (await fs.readdir(path.join(rootDir, dir))).map(file => {
        return {
            basename: file,
            abspath: path.join(rootDir, dir, file),
            relpath: path.join(dir, file),
        }
    })
    cache.set(dir, dirStat.mtime, files)
    return files
}

export function parseSource(text) {
    const comments = []
    const ast = meriyah.parseModule(text, {
        onComment: comments,
        loc: true,
        ranges: true,
		next: true,
		raw: true,
	})
	ast.loc = [ast.loc]
    return Object.assign(ast, {
        comments,
    })
}

export const kVirtualContents = Symbol('virtual-contents')

export async function* walkSources(rootDir, {targetDir, targetStat, srcCache} = {}) {
	if (rootDir[kVirtualContents] && isTestEnv) {
		yield* rootDir[kVirtualContents]
		return
	}

    rootDir = rootDir || path.join(process.cwd(), 'src')
    targetDir = targetDir || ''
    targetStat = targetStat || await fs.lstat(path.join(rootDir, targetDir))
    srcCache = srcCache || await openCache('ast')

    for (const node of await readdir(rootDir, targetDir, targetStat)) {
        const nodeStat = await fs.lstat(node.abspath)

        if (nodeStat.isSymbolicLink()) {
            // Ignore links
        } else if (nodeStat.isDirectory()) {
            yield* walkSources(rootDir, {
                targetDir: node.relpath,
                targetStat: nodeStat,
            })
        } else if (nodeStat.isFile() && node.relpath.endsWith('.js')) {
            yield {
                ...node,
                mtime: nodeStat.mtime,
                isModified: !srcCache.get(node.relpath, node.mtime),
                async parseSource() {
                    const text = await fs.readFile(node.abspath, 'utf8')
                    const cachedAst = srcCache.get(node.relpath, node.mtime)
                    if (cachedAst) {
                        return { text, ast: cachedAst }
                    }

					const ast = parseSource(text)
					console.warn(ast)
                    srcCache.set(node.relpath, node.mtime, ast)
                    return {
                        text,
                        ast,
                    }
                },
            }
        }
    }
}
