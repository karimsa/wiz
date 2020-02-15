export class Semaphore {
	constructor(size = 1) {
		this.issuedTokens = new Set()
		this.tokens = [...new Array(size).keys()]
		this.lockers = []
	}

	lock() {
		return new Promise(resolve => {
			const token = this.tokens.shift()
			if (token !== undefined) {
				return resolve(token)
			}

			this.lockers.push(resolve)
		}).then(token => {
			this.issuedTokens.add(token)
			return token
		})
	}

	unlock(token) {
		if (this.issuedTokens.has(token)) {
			const nextResolve = this.lockers.shift()
			if (nextResolve !== undefined) {
				return nextResolve(token)
			}

			this.issuedTokens.delete(token)
			this.tokens.push(token)

			return this
		} else {
			throw new Error(`Unknown unlock token: ${token}`)
		}
	}
}
