#!/bin/bash
set -e
set -o pipefail

propDirectory="`cd $(dirname $0) && pwd`"
if echo "$propDirectory" | grep '/_npx/' &>/dev/null; then
    echo "Please do not run with npx."
    exit 1
fi

export PATH="$PATH:$propDirectory/node_modules/.bin"

function show_usage() {
    echo -e "usage: $0 [command] [options]"
    echo -e ""

    echo -e "Commands:"
    for script in `find ${propDirectory}/commands -type f -name '*.sh'`; do
        cmd="`basename $script | cut -d. -f1`"
        description="`cat $script | grep '@description:' | cut -d: -f2 | cut -d\  -f2-`"

        echo -e "\t${cmd}\t${description}"
    done
    echo -e ""

    exit 1
}

export command=""

while test "$#" -gt "0"; do
    case "$1" in
        -h|--help)
            show_usage
            ;;

        -v|--version)
            jq -r "$propDirectory/package.json"
            ;;

        -*)
            echo "Unknown flag: $1"
            exit 1
            ;;

        *)
            command="$1"
            shift
            break
            ;;
    esac
done

if test -z "$command"; then
    show_usage
fi

if test -e "${propDirectory}/commands/${command}.sh"; then
    source "${propDirectory}/commands/${command}.sh"
else
    echo "Unknown command: $command"
    show_usage
fi
