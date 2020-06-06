import * as t from 'assert';
import { parseScript } from '../../../src/meriyah';
import { matchesRight } from '../../test-utils';

describe('Miscellaneous - onToken', () => {
  it('tokenize braces using array', () => {
    const { tokens } = parseScript('{}', {
      loc: true
    });
    matchesRight.assert(tokens, [
      {
        end: 1,
        start: 0,
        type: 'Punctuator'
      },
      {
        end: 2,
        start: 1,
        type: 'Punctuator'
      }
    ]);
  });

  it('tokenize boolean using function', () => {
    const { tokens } = parseScript('// c\nfalse', {
      loc: true
	});
	t.equal(tokens.length, 1);
	t.equal(tokens[0].type, 'BooleanLiteral');
	t.deepEqual(tokens[0].start, 5);
	t.deepEqual(tokens[0].end, 10);
  });
});
