// Pretty-prints the compat info for the current node lts releases

const MIN_NODE_LTS = 10

Object.entries(require('@babel/compat-data/data/plugins.json'))
	.map(([plugin, { node }]) => {
		if (node) {
			return [plugin, { node: +node.split('.')[0] }]
		}
	})
	.filter(data => {
		return data && data[1].node > MIN_NODE_LTS
	})
	.sort((a, b) => a[1].node - b[1].node)
	.forEach(([plugin, { node }], index, self) => {
		if (index > 0 && self[index - 1][1].node !== node) {
			console.warn()
		}
		console.warn(` - ${plugin} (node v${node}.x)`)
	})
