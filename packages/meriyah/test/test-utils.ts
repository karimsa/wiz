import * as t from 'assert';
import { parseSource } from '../src/parser';
import { Context } from '../src/common';

function matchesRight(left: any, right: any) {
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
}

describe('matchesRight', () => {
	it('should work with extra props', () => {
		t.equal(matchesRight({
			a: 1,
			b: 1,
		}, {
			a: 1,
		}), true);
		t.equal(matchesRight({
			a: 1,
		}, {
			a: 2,
		}), false);
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
