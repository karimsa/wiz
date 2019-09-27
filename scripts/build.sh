#!/bin/bash
set -e
set -o pipefail

tmp="`mktemp -d`"

function create_hash() {
	if which md5 &>/dev/null; then
		cat "$1" | md5
	else
		cat "$1" | md5sum | cut -d- -f1
	fi
}

# compile an initial copy with just babel, since
# that should always work
rm -rf dist
babel src -d dist

echo ""
echo "Building: .eslintrc.dist.js"
node scripts/build-eslint.js

# compile the actual build with the babel version
echo ""
echo "Building: cli using babel-compiled cli:"
node dist/cli.js build src/cli.js
echo "cli.dist.js - `create_hash cli.dist.js`"

echo ""
echo "Building: src/register-profiler.js src/bench.js"
./cli.dist.js build src/register-profiler.js src/bench.js

echo ""
echo "Building: docs"
./cli.dist.js doc

if test "$CI" = "true"; then
	# compile several times with the tool itself to ensure
	# that the build works
	for ((i=0;i<5;i++)); do
		echo ""
		echo "build #$[i+1]:"
		./cli.dist.js build src/cli.js

		hash="`create_hash cli.dist.js`"
		echo "cli.dist.js - $hash"
		cp "cli.dist.js" "${tmp}/cli.${hash}.js"
	done
fi

echo ""
echo "Build directory: $tmp"
ls -lh "$tmp"
