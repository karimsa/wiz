<h1 align="center">wiz</h1>
<p align="center">Zero config toolchain to manage JS projects with simplicity.</p>
<p align="center">
	<a href="https://circleci.com/gh/karimsa/wiz">
		<img src="https://circleci.com/gh/karimsa/wiz.svg?style=svg" alt="CircleCI">
	</a>
</p>

**Features:**

 * **Build projects:** wraps [rollup](https://github.com/rollup/rollup) with a pipeline to build libraries, tools, & APIs.
 * **Lint projects:** wraps [eslint](https://github.com/eslint/eslint) with strict, non-configurable defaults (and bumps performance).
 * **Test projects:** wraps [jest](http://github.com/facebook/jest) with dynamic defaults.
 * **Benchmark projects:** provides a benchmark runner.
 * **Profile projects:** provides an instrumentation-based CPU profiler to isolate bottlenecks.

**Table of contents:**

 * [Getting started](#getting-started)
 * [Writing benchmarks](#writing-benchmarks)
 * [License](#license)

## Getting started

To get started, simply install `@karimsa/wiz` as a devDependency into your project. The CLI can be called using the `wiz` command.
Help information is baked into all sub-commands via the `--help` flag. Documentation is being worked on.

## Writing benchmarks

Writing benchmarks with `wiz` involves understanding a bit about how benchmarks are run. The benchmark runner consists of two parts - a utility that is imported from `@karimsa/wiz/bench` and the benchmark CLI that is invoked by calling `wiz bench`. Here's a sample benchmark:

```javascript
import { benchmark } from '@karimsa/wiz/bench'

function fib(n) {
	if (n < 2) {
		return 1
	}
	return fib(n - 1) + fib(n - 2)
}

benchmark('fib(10)', async b => {
	for (let i = 0; i < b.N(); ++i) {
		fib(10)
	}
})
```

The `@karimsa/wiz/bench` import exposes a single function called `benchmark` which allows your script to register benchmarks. This function takes two arguments: a title for the benchmark and a function to run the benchmark. The function that runs the benchmark may be synchronous or it may be asynchronous in which case it **must** return a promise.

Your benchmark function will receive a single parameter: the `b` object. Which has the following methods:

 * **resetTimer()**: Resets the benchmark timer. Useful for running after you do any expensive setup for your benchmark.
 * **N()**: Returns the number of times you should execute the code you wish to mention.

The benchmark runner calls each benchmark function multiple times. Each time, the number returned by `b.N()` will be larger. For the duration of a single call to the benchmark function, the value will stay the same. The value begins at 1 and keeps increasing until the benchmark function timer exceeds the duration of 1 second. Once it does, the benchmark statistics like the number of operations per second and time per operation will be written to the console.

When imported into a node process, `@karimsa/wiz/bench` schedules the benchmark execution for the next tick of the event loop. This means that you can run any benchmark file by simply using node (i.e. `node src/__bench__/bench-my-benchmark.js`). However, when you run `wiz bench`, it will only run benchmarks in files that match the glob `src/**/__bench__/bench-*.js`.

Benchmarks are executed serially within the node process. Files are split between different node processes for performance. This means that serial execution is guaranteed between benchmarks in a single file but not for benchmarks across files. Generally speaking, benchmarks should be written like test cases: isolated and concurrency-safe. In the future, the benchmark runner may execute benchmarks within the same file in parallel too but never concurrently, to avoid sharing process resources in between benchmarks.

As a side note, the benchmark runner does not cache anything at all so every call to the runner will execute a fresh benchmark run.

### Running specific benchmarks

To run some benchmarks but not others, you can change the benchmark registration function to `benchmark.only` instead of `benchmark`. Like so:

```javascript
import { benchmark } from '@karimsa/wiz/bench'

benchmark.only('run me', async b => {
	// ...
})

benchmark('but not me', async b => {
	// ...
})
```

The benchmark runner that comes with `wiz` is quite similar to the one that is built into the `testing` package for `go`. As such, I recommend reading Dave Cheney's blog post on [How to write benchmarks in Go](https://dave.cheney.net/2013/06/30/how-to-write-benchmarks-in-go).

## License

Licensed under MIT license.

Copyright &copy; 2019-present Karim Alibhai. All rights reserved.
