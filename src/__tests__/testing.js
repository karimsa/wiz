import * as path from 'path'

export const describe = global.describe
export const it = global.it
export const expect = global.expect

export function fixture(dir) {
	return path.resolve(__dirname, '..', '..', 'fixtures', dir)
}
