import * as fs from 'fs'
import * as path from 'path'
import * as util from 'util'

const fsPromises = module.exports = process.version.startsWith('v12') ? fs.promises : {
    readFile: util.promisify(fs.readFile),
    writeFile: util.promisify(fs.writeFile),
    readdir: util.promisify(fs.readdir),
    lstat: util.promisify(fs.lstat),
    mkdir: util.promisify(fs.mkdir),
}

Object.assign(module.exports, {
    async mkdirp(target, dirs) {
        for (const dir of dirs) {
            target = path.join(target, dir)
            try {
                await fsPromises.mkdir(target)
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    throw error
                }
            }
        }
    },
})
