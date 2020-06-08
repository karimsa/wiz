import { generate } from '../generate'
import { parseSource } from '../walk'

describe('Generator', () => {
	it('should keep same quotes in strings', () => {
		expect(generate(parseSource(`let _ = 'single'`))).toEqual(`let _ = 'single';`)
		expect(generate(parseSource(`let _ = "double"`))).toEqual(`let _ = "double";`)
	})
})
