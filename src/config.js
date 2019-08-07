import * as path from 'path'

export const mainDirectory = path.join(process.cwd(), '.wiz')
export const isCI = process.env.CI === 'true'

// This NODE_ENV will get replaced at build-time
export const WizNodeEnv = process.env.NODE_ENV || 'development'

// This one is dynamic
export const CurrentNodeEnv = process.env['NODE_ENV'] || 'development'
