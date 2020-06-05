import * as path from 'path'

import * as fs from './fs'

let wizDirExists = false

class CacheHandler {
    constructor(cachePath, data) {
        this.cachePath = cachePath
        this.data = data
        this.dirty = false
    }

    isDirty() {
        return this.dirty
    }

    get(key, integrity) {
        const node = this.data[key]
        if (node && node.integrity === integrity) {
            return node.value
        }
    }

    set(key, integrity, value) {
        const node = this.data[key]
        if (node && node.integrity === integrity) {
            return
        }

        this.data[key] = {
            integrity,
            value,
        }
        this.dirty = true
    }

    reset() {
        this.data = {}
        this.dirty = true
    }

    async write() {
        if (this.dirty) {
            await fs.writeFile(this.cachePath, JSON.stringify(this.data))
            this.dirty = false
        }
    }
}

const openedCaches = new Map()

export async function openCache(name) {
    if (openedCaches.has(name)) {
        return openedCaches.get(name)
    }

    if (!wizDirExists) {
        await fs.mkdirp(process.cwd(), ['.wiz', 'cache'])
        wizDirExists = true
    }

    const cachePath = path.join(process.cwd(), '.wiz', 'cache', name + '.json')
    let cacheData

    try {
        const cacheContents = await fs.readFile(cachePath)
        cacheData = JSON.parse(cacheContents)
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error
        }
    }

    const cacheHandler = new CacheHandler(cachePath, cacheData || {})
    openedCaches.set(name, cacheHandler)
    return cacheHandler
}

export async function closeAllCaches() {
    for (const [key, cacheHandler] of openedCaches.entries()) {
        await cacheHandler.write()
        openedCaches.delete(key)
    }
}
