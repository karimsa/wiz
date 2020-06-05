import parseArgs from 'minimist'

import { lintCommand } from './commands/lint'

const printHelp = () => console.log(
`usage: wiz [command] [options]

Commands:
    build   produces a bundle for production
    lint    performs formatting and linting
    watch   starts builder and linter in watch mode

`
)

const argv = parseArgs(process.argv.slice(3))

export function main() {
    switch (process.argv[2]) {
        case 'lint':
            return lintCommand(argv)

        default:
            console.error(`Unknown command: ${process.argv[2]}`)
            printHelp()
    }
}
