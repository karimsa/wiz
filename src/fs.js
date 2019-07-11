/**
 * @file src/fs.js
 * @copyright Karim Alibhai. All rights reserved.
 */

import * as fs from 'fs'
import * as util from 'util'

export const readFile = util.promisify(fs.readFile)
export const writeFile = util.promisify(fs.writeFile)
export const readdir = util.promisify(fs.readdir)
export const stat = util.promisify(fs.stat)
export const mkdir = util.promisify(fs.mkdir)
export const chmod = util.promisify(fs.chmod)
