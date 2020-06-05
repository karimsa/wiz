import * as t from 'assert';
import { parseSource } from '../src/parser';
import { Context } from '../src/common';

export const matchesRight = Object.assign(function(left: any, right: any) {
	if (typeof left !== typeof right) {
		return false
	}
	if (typeof left !== 'object') {
		return left === right
	}

	for (const key in right) {
		if (right.hasOwnProperty(key) && !matchesRight(left[key], right[key])) {
			return false
		}
	}
	return true
}, {
	assert: (left: any, right: any) => t.equal(matchesRight(left, right), true),
	assertFalse: (left: any, right: any) => t.equal(matchesRight(left, right), false),
})

describe('matchesRight', () => {
	it('should work with extra props', () => {
		matchesRight.assert({
			a: 1,
			b: 1,
		}, {
			a: 1,
		});
		matchesRight.assertFalse({
			a: 1,
		}, {
			a: 2,
		});
	});
});

export const pass = (name: string, valids: [string, Context, any][]) => {
  describe(name, () => {
    for (const [source, ctx, expected] of valids) {
      it(source, () => {
        const parser = parseSource(source, undefined, ctx);
        t.equal(matchesRight(parser, expected), true);
      });
    }
  });
};

export const fail = (name: string, invalid: [string, Context][]) => {
  describe(name, () => {
    for (const [source, ctx] of invalid) {
      it(source, () => {
        t.throws(() => {
          parseSource(source, undefined, ctx);
        });
      });
    }
  });
};
