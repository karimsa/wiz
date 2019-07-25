#!/usr/bin/env node

const fs = require('fs')
const config = {
	plugins: [],
}
const kPluginName = Symbol('kPluginName')

function loadConfig(extender) {
	if (extender.startsWith('plugin:')) {
		extender = extender.substr('plugin:'.length)
		const [pluginName, configName] = extender.split('/')
		const plugin = require(`eslint-plugin-${pluginName}`)
		const pluginConfig = plugin.configs[configName]
		pluginConfig[kPluginName] = pluginName
		console.log(`Loaded plugin: ${pluginName}`)
		return pluginConfig
	}

	return require(`eslint-config-${extender}`)
}

function deepAssign(target, source) {
	for (const key in source) {
		if (Reflect.has(source, key)) {
			if (key === 'plugins') {
				target[key] = target[key] || []
				target[key].push(...source[key])
			} else if (
				Array.isArray(source[key]) ||
				typeof source[key] !== 'object' ||
				!Reflect.has(target, key)
			) {
				target[key] = source[key]
			} else {
				deepAssign(target[key], source[key])
			}
		}
	}
}

function extendConfig(extender) {
	const extended = (
		typeof extender === 'string' ?
		loadConfig(extender) :
		extender
	)

	if (extended[kPluginName] && !config.plugins.includes(extended[kPluginName])) {
		config.plugins.push(extended[kPluginName])
	}

	if (Reflect.has(extended, 'extends')) {
		for (const child of extended.extends) {
			console.log(`Extending via ${child} (asked for by ${extender})`)
			extendConfig(child)
		}
	}

	deepAssign(config, extended)
}

extendConfig(require('../.eslintrc.js'))

config.envs = Object.keys(config.env)
config.globals = Object.keys(config.globals)
delete config.extends
delete config.env

// TODO: This must be a smarter way to figure out
// which plugins need to be here
config.plugins = [
	"import",
	"promise",
	"standard",
	"prettier",
	'node',
]

console.log('Writing: .eslintrc.dist.js')
fs.writeFile(__dirname + '/../.eslintrc.dist.js', 'module.exports = ' + JSON.stringify(config, null, '\t'), err => {
	if (err) {
		console.error(err.stack)
		process.exit(1)
	}
})
