#!/bin/sh
# Runs the file-access tests on the Mac (FileAccess.swift and TextFile.swift use only Foundation). From anywhere: ios/tests/run.sh
set -e
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
out="$work/fileaccess-tests"
swiftc -swift-version 5 -parse-as-library -module-cache-path "$work/modules" -o "$out" "$here/../Typewrencher/TextFile.swift" "$here/../Typewrencher/FileAccess.swift" "$here/FileAccessTests.swift"
"$out"
