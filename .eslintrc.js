module.exports = {
	"extends": [
		"standard",
		"plugin:import/errors",
		"prettier",
		"prettier/standard"
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
				"varsIgnorePattern": "^_+$"
			}
		],
		"no-labels": "off",
		"import/order": ["error", {
			"groups": [
				"builtin",
				"external",
				"internal",
			],
			"newlines-between": "always"
		}],
		"quote-props": ["error", "as-needed"]
	}
}
