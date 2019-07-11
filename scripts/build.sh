#!/bin/bash
set -e
set -o pipefail

tmp="`mktemp -d`"

# compile an initial copy with just babel, since
# that should always work
rm -rf dist
babel src -d dist

# compile the actual build with the babel version
echo ""
echo "building cli using babel-compiled cli:"
node dist/cli.js build src/cli.js
echo "cli.dist.js - `cat cli.dist.js | md5`"

# compile several times with the tool itself to ensure
# that the build works
for ((i=0;i<5;i++)); do
	echo ""
	echo "build #$[i+1]:"
	./cli.dist.js build src/cli.js
	echo "cli.dist.js - `cat cli.dist.js | md5`"
	cp "cli.dist.js" "${tmp}/cli.`cat cli.dist.js | md5`.js"
done

echo ""
echo "Build directory: $tmp"
ls -lh "$tmp"

