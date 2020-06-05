import * as path from 'path'
import typescript from 'typescript'
import typescriptPlugin from 'rollup-plugin-typescript2'

export default {
	input: './src/meriyah.ts',
	output: {
		file: './meriyah.dist.js',
		name: 'meriyah',
		format: 'cjs',
	},
	plugins: [
		typescriptPlugin({
			tsconfig: path.join(__dirname, 'tsconfig.json'),
			typescript,
		}),
	],
}
