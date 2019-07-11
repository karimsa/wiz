module.exports = {
	"extends": [
		"standard",
		"plugin:prettier/recommended"
	],
	"rules": {
		"no-tabs": "off",
		"indent": "off",
		"no-mixed-spaces-and-tabs": "off",
		"comma-dangle": [
			"error",
			"always-multiline"
		],
		"no-unused-vars": [
			"error",
			{
				"varsIgnorePattern": "_"
			}
		]
	}
}
