/**
 * Command to generate documentation from local
 * source files. For usage information, see help output
 * viewable by running `wiz doc --help`.
 */

import * as path from 'path'
import { spawn } from 'child_process'

import createDebug from 'debug'
import marked from 'marked'
import open from 'open'
import { codeFrameColumns } from '@babel/code-frame'
import * as babel from '@babel/core'
import babelTraverse from '@babel/traverse'

import { readFile, writeFile } from '../fs'
import { findSourceFiles } from '../glob'

const debug = createDebug('wiz:doc')

const supportedDirectives = new Set(['type', 'param', 'returns', 'description'])

function parseParam(line) {
	if (line[0] !== '{') {
		throw new Error(`No type information given for parameter`)
	}

	const indexOfTypeEnd = line.indexOf('}')
	const indexOfNameEnd = line.indexOf(' ', indexOfTypeEnd + 2)
	const type = line.substr(1, indexOfTypeEnd - 1)
	const name = line.substring(indexOfTypeEnd + 2, indexOfNameEnd)

	return {
		type,
		name,
		description: line.substr(indexOfNameEnd + 1),
	}
}

function parseReturn(line) {
	if (line[0] !== '{') {
		throw new Error(`No type information given for parameter`)
	}

	const indexOfTypeEnd = line.indexOf('}')
	const type = line.substr(1, indexOfTypeEnd - 1)

	return {
		type,
		description: line.substr(indexOfTypeEnd + 1),
	}
}

function addDirectiveBuffer(directive, buffer, doc) {
	if (directive === 'param') {
		doc.params.push(parseParam(buffer))
	} else if (directive === 'returns') {
		doc.returns = parseReturn(buffer)
	} else if (directive === 'description') {
		doc.description = marked(buffer)
	} else {
		doc[directive] = buffer
	}
}

function parseDocString(docString) {
	let currentDirective = 'description'
	let directiveBuffer = ''
	const parsed = {
		params: [],
	}

	for (let line of docString.split('\n')) {
		if (line.startsWith(' * ')) {
			line = line.substr(3)
		}

		if (line[0] === '@') {
			const endOfDirective = line.indexOf(' ')
			const directiveName = line.substring(1, endOfDirective)
			if (!supportedDirectives.has(directiveName)) {
				throw new Error(`Unknown docstring directive: ${directiveName}`)
			}

			debug(`Switching from parsing ${currentDirective} to ${directiveName}`)
			addDirectiveBuffer(currentDirective, directiveBuffer.trim(), parsed)

			currentDirective = directiveName
			directiveBuffer = line.substr(endOfDirective + 1)
		} else if (line === '*' || line === ' *') {
			directiveBuffer += '\n'
		} else {
			directiveBuffer += line + '\n'
		}
	}

	addDirectiveBuffer(currentDirective, directiveBuffer.trim(), parsed)
	return parsed
}

function getDocElementType(path) {
	if (path.isExportNamedDeclaration()) {
		const declaration = path.get('declaration')

		if (declaration.isFunctionDeclaration()) {
			return {
				type: 'function',
				node: path.node.declaration,
			}
		}

		if (declaration.isVariableDeclaration()) {
			if (declaration.node.declarations.length !== 1) {
				throw new Error(
					`Unexpected number of variable declarations exported in one statement: ${declaration.declarations.length}`,
				)
			}

			const init = declaration.get('declarations')[0].get('init')

			if (init.isFunctionExpression()) {
				return {
					type: 'function',
					node: init.node,
				}
			}

			return {
				type: 'constant',
				node: declaration.node.declarations[0],
			}
		}

		if (declaration.isClassDeclaration()) {
			return {
				type: 'class',
				node: declaration.node,
			}
		}

		throw new Error(
			`Unexpected named export declaration: ${declaration.node.type}`,
		)
	}

	throw new Error(`Unexpected export of type ${path.node.type}`)
}

async function generateDocs(file) {
	const fileCode = await readFile(file, 'utf8')
	const ast = await babel.parseAsync(fileCode, {
		filename: file.replace(process.cwd(), ''),
	})
	const docs = []
	let description = null

	if (ast.comments.length > 0 && ast.comments[0].start === 0) {
		try {
			description = parseDocString(ast.comments[0].value).description
		} catch (error) {
			const stack =
				'\n' +
				codeFrameColumns(fileCode, {
					start: ast.comments[0].loc.start,
				}) +
				'\n' +
				String(error.stack) +
				'\n'
			const err = {
				stack,
			}
			throw err
		}
	}

	babelTraverse(ast, {
		ExportNamedDeclaration(path) {
			const comments = path.node.leadingComments || [
				{
					value: '',
				},
			]

			if (comments.length > 1) {
				throw path.buildCodeFrameError(`Unexpected: multiple leading comments`)
			}

			try {
				const { type, node } = getDocElementType(path)
				if (!node.id) {
					throw new Error(`No identifier for node of type ${type}`)
				}
				const directives = parseDocString(comments[0].value)
				const doc = {
					type,
					name: node.id.name,
					directives,
				}

				if (directives.type !== undefined) {
					doc.type = directives.type
				}

				// if (type === 'function') {
				// 	if (directives.params.length !== node.params.length) {
				// 		console.log({ directives, node })
				// 		throw new Error(`@param is missing for some parameters`)
				// 	}

				// 	if ((node.async || node.generator) && !directives.returns) {
				// 		throw new Error(
				// 			`@returns is required for async and generator functions`,
				// 		)
				// 	}
				// }

				docs.push(doc)
			} catch (error) {
				throw path.buildCodeFrameError(error.message)
			}
		},
	})

	return {
		file,
		description,
		docs,
	}
}

function renderDocSection(doc) {
	switch (doc.type) {
		case 'function':
			return (
				(doc.directives.description
					? `<p class="lead mb-5">${doc.directives.description}</p>`
					: '') +
				(doc.directives.params.length > 0
					? `<h6>Parameters</h6>
					<ul>
						${doc.directives.params
							.map(
								param => `
							<li>
								<strong>${param.name} (</strong><pre class="mb-0 d-inline text-pink">${param.type}</pre><strong>):</strong>
								${param.description}
							</li>
						`,
							)
							.join('')}
					</ul>`
					: '') +
				(doc.directives.returns
					? `<h6>Return value</h6>
				<div>
					<span>Type:</span>
					<pre class="mb-0 d-inline text-pink">${doc.directives.returns.type}</pre>
				</div>
				<p>${doc.directives.returns.description}</p>`
					: '')
			)

		case 'class':
			return `
			<p>TODO</p>
			`

		case 'constant':
			return doc.directives.description
				? `<p class="lead mb-5">${doc.directives.description}</p>`
				: ''

		default:
			throw new Error(`Not sure how to render: ${doc.type}`)
	}
}

function renderDocsPage({ file, description, docs }) {
	return (
		`<h2>${shortenPath(file)}</h2>` +
		(description
			? `<h6>Description</h6><p class="lead">${description}</p>`
			: '') +
		docs
			.map(
				doc => `
				<div>
					<div class="d-flex align-items-center mt-5 mb-3">
						<span class="badge badge-primary mr-2">${doc.type}</span>
						<h4 class="d-inline-block mb-0">${doc.name}</h4>
					</div>

					${renderDocSection(doc)}
				</div>`,
			)
			.join('')
	)
}

const cwd = process.cwd()

function shortenPath(file) {
	return file.startsWith('./src')
		? file.substr('./src/'.length)
		: file.startsWith(cwd + '/src')
		? file.substr(cwd.length + '/src/'.length)
		: file
}

function insertSorted(elm, list) {
	for (let i = 0; i < list.length; ++i) {
		if (list[i] > elm) {
			list.splice(i, 0, elm)
			return
		}
	}
	list.push(elm)
}

function createFileTree(files) {
	const root = {
		name: 'src',
		dirs: [],
		files: [],
	}

	files.forEach(doc => {
		const file = shortenPath(doc.file)
		const filepath = file.split('/')
		let parent = root

		for (let i = 0; i < filepath.length - 1; ++i) {
			const dirNode = parent.dirs.find(dir => {
				return dir.name === filepath[i]
			})
			if (dirNode) {
				parent = dirNode
			} else {
				const newNode = {
					name: filepath[i],
					dirs: [],
					files: [],
				}
				parent.dirs.push(newNode)
				parent = newNode
			}
		}

		insertSorted(doc.file, parent.files)
	})

	return root
}

function renderFileTree(root) {
	return `
	<ul class="nav nav-pills flex-column pl-3">
		${root.dirs
			.map(
				dir => `
			<li class="nav-item text-left">
				<a class="nav-link text-white disabled dir-link">${dir.name}</a>
				${renderFileTree(dir)}
			</li>
		`,
			)
			.join('')}
		${root.files
			.map(
				file => `
			<li class="nav-item text-left">
				<a href="#" data-file="${file}" class="nav-link text-white">${path.basename(
					file,
				)}</a>
			</li>
		`,
			)
			.join('')}
	</ul>
	`
}

async function writeDocs({
	readme,
	docs,
	name,
	version,
	revision,
	homepage,
	github,
}) {
	const docTree = createFileTree(docs)

	await writeFile(
		'./docs/index.html',
		`<!doctype html>
		<html>
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
				<title>Documentation for ${name} ${version}</title>

				<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous">
				<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.15.9/styles/agate.min.css">

				<style>
					.sidebar {
						background-color: #343131;
					}

					.sidebar a:hover,
					.sidebar a:active,
					.sidebar a:focus,
					.sidebar .active a {
						background-color: #4e4a4a;
					}

					html,
					body,
					.h-100 {
						height: 100%;
					}

					.min-h-100 {
						min-height: 100%;
					}
					
					.text-pink {
						color: #e83e8c;
					}

					.main {
						background-color: #eaeaea;
					}

					pre {
						border-radius: .3rem;
					}

					pre > code.hljs {
						padding: 1rem;
					}

					h6 {
						text-transform: uppercase;
						color: #777;
						font-size: .8rem;
						margin: 2rem 0;
					}

					.col-auto.sidebar {
						min-width: 25%;
					}

					.dir-link {
						position: relative;
					}
					
					.dir-link::before {
						content: '📁';
						position: absolute;
						left: -.25rem;
						font-size: .8rem;
						margin-top: .25rem;
					}					
				</style>
			</head>

			<body>
				<div class="container-fluid h-100">
					<div class="row h-100 overflow-hidden">
						<div class="col-auto sidebar h-100 py-4 overflow-auto">
							<div class="text-center p-4 rounded-lg bg-primary">
								<h5 class="font-weight-bold text-white">${name}</h5>
								<p class="text-white mb-0">${version}${
			revision ? `<span class="px-2">&bull;</span>${revision}` : ''
		}${github || homepage ? `<span class="px-2">•</span>` : ''}${
			github
				? `<a class="text-white ${
						homepage ? 'mr-2' : ''
				  }" href="${github}"><i class="fab fa-github-square"></i></a>`
				: ''
		}
		${
			homepage
				? `<a class="text-white" href="${homepage}"><i class="fas fa-link"></i></a>`
				: ''
		}</p>
							</div>

							<ul class="nav flex-column nav-pills nav-fill mt-4">
								<li class="nav-item text-left">
									<a href="#" class="nav-link text-white" data-file="__README__">Overview</a>

									<ul class="nav flex-column nav-pills nav-pill pl-3">
										${readme.headings
											.map(heading => {
												return `
												<li class="nav-item text-left">
													<a href="#${heading.slug}" class="nav-link text-white">${heading.text}</a>
												</li>
											`
											})
											.join('')}
									</ul>
								</li>

								<li class="nav-item text-left">
									<a class="nav-link text-white disabled">Sources</a>
									${renderFileTree(docTree)}
								</li>
							</ul>
						</div>

						<div class="col main h-100 px-md-5 py-4 overflow-auto d-flex" id="scroll-container">
							<div class="container">
								<div class="row">
									<div class="col p-md-5 bg-white rounded-lg" role="main">
										${readme.content}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<script async src="https://kit.fontawesome.com/7d12e17cf9.js"></script>
				<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.15.9/highlight.min.js"></script>
				<script>
					!function() {
						var main = document.querySelector('[role="main"]')
						var scrollContainer = document.getElementById('scroll-container')
						var docs = ${JSON.stringify(
							docs.reduce(
								(docsByFile, doc) => {
									docsByFile[doc.file] = renderDocsPage(doc)
									return docsByFile
								},
								{
									__README__: readme.content,
								},
							),
							null,
							'\t',
						)}

						function scrollToTop({ stepSize }) {
							if (scrollContainer.scrollTop > 1) {
								stepSize = stepSize || (scrollContainer.scrollTop / 100)
								scrollContainer.scrollTop -= stepSize
								requestAnimationFrame(function() {
									scrollToTop({ stepSize })
								})
							}
						}

						function updateAfterRender() {
							document.querySelectorAll('pre > code').forEach(block => {
								hljs.highlightBlock(block)
							})
						}

						document.querySelectorAll('a[data-file]').forEach(fileLink => {
							fileLink.addEventListener('click', evt => {
								evt.preventDefault()
								main.innerHTML = docs[fileLink.getAttribute('data-file')]

								updateAfterRender()
							})
						})

						updateAfterRender()
					}()
				</script>
			</body>
		</html>`,
	)
}

/**
 * Executes documentation generation on all source files
 * part of the local repository.
 */
export async function docCommand(argv) {
	const docs = []
	const goals = []
	let error

	for await (const { file, type } of findSourceFiles({
		cache: {},
		directory: path.join(process.cwd(), 'src'),
	})) {
		if (type === 'source') {
			goals.push(
				generateDocs(file).then(
					doc => {
						if (doc.description || doc.docs.length > 0) {
							docs.push(doc)
						}
					},
					err => {
						error = err
					},
				),
			)
		}
	}

	await Promise.all(goals)
	if (error) {
		throw error
	}

	const gitRev = await new Promise((resolve, reject) => {
		const gitChild = spawn('git log --format="%h" --max-count=1', {
			stdio: ['ignore', 'pipe', 'inherit'],
			shell: true,
		})
		let stdout = ''

		gitChild.stdout.on('data', chunk => {
			stdout += chunk.toString('utf8')
		})

		gitChild.on('error', error => {
			if (error.code === 'ENOENT') {
				resolve()
			} else {
				reject(error)
			}
		})

		gitChild.on('close', code => {
			if (code !== 0) {
				reject(new Error(`git exited with code: ${code}`))
			} else {
				resolve(stdout)
			}
		})
	})

	const readme = {
		headings: [],
	}
	const renderer = new marked.Renderer()
	const pkg = require(path.join(process.cwd(), 'package.json'))

	renderer.heading = function(text, level, _, slugger) {
		const slug = slugger.slug(text)
		readme.headings.push({
			text,
			slug,
		})
		return `<h${level} id="${slug}"><a class="text-body" href="#${slug}">${text}</a></h${level}>`
	}

	try {
		readme.content = marked(await readFile('./README.md', 'utf8'), {
			renderer,
		})
	} catch (error) {
		if (error.code !== 'ENOENT') {
			throw error
		}

		readme.content = [
			`# ${pkg.name}`,
			``,
			pkg.description || '(No description)',
			'',
			pkg.license
				? `## License

Licensed under ${pkg.license}.`
				: '',
		].join('\n')
	}

	await writeDocs({
		readme,
		docs,
		name: pkg.name,
		version: pkg.version ? 'v' + pkg.version : 'unversioned',
		homepage: pkg.homepage,
		github: pkg.repository ? pkg.repository.url : undefined,
		revision: gitRev,
	})

	if (argv.open) {
		await open(path.join(process.cwd(), 'docs', 'index.html'))
	}
}

/**
 * `--open` opens `docs/index.html` in the default browser after building the
 * documentation.
 */
export const docFlags = {
	open: {
		alias: 'o',
		type: 'boolean',
		default: false,
		describe: 'Opens the documentation after building it',
	},
}
