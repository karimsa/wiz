const startTime = Date.now()

require('./main').main()
    .then(() => {
        console.log(`exit in ${Date.now() - startTime}ms`)
    })
    .catch(error => {
        console.error(error.stack)
        process.exit(1)
    })
