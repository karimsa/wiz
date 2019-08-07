/**
 * Command to generate documentation from local
 * source files. For usage information, see help output
 * viewable by running `wiz doc --help`.
 */

import * as path from 'path'

import createDebug from 'debug'
import marked from 'marked'
import * as babel from '@babel/core'
import babelTraverse from '@babel/traverse'
import { WaitGroup } from 'rsxjs'

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
	const ast = await babel.parseAsync(await readFile(file, 'utf8'), {
		filename: file.replace(process.cwd(), ''),
	})
	const docs = []
	const description =
		ast.comments.length > 0 && ast.comments[0].start === 0
			? parseDocString(ast.comments[0].value).description
			: null

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
				`<p class="lead mb-5">${doc.directives.description}</p>` +
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
			return `<p class="lead mb-5">${doc.directives.description}</p>`

		default:
			throw new Error(`Not sure how to render: ${doc.type}`)
	}
}

function renderDocsPage({ description, docs }) {
	console.log(docs)
	return (
		`
		<h6>Description</h6>
		<p class="lead">${description || 'Not sure what this file does. Do you?'}</p>` +
		docs
			.map(
				doc => `
				<div>
					<div class="d-flex align-items-center my-5">
						<span class="badge badge-primary mr-2">${doc.type}</span>
						<h4 class="d-inline-block mb-0">${doc.name}</h4>
					</div>

					${renderDocSection(doc)}
				</div>`,
			)
			.join('')
	)
}

async function writeDocs(readme, docs) {
	const pkg = require(path.join(process.cwd(), 'package.json'))

	await writeFile(
		'./docs/index.html',
		`<!doctype html>
		<html>
			<head>
				<meta charset="utf-8">
				<title>Documentation for ${pkg.name} v${pkg.version}</title>

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
						background-color: #fcfcfc;
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
				</style>
			</head>

			<body>
				<div class="container-fluid h-100">
					<div class="row h-100 overflow-hidden">
						<div class="col-auto sidebar h-100 py-4 overflow-auto">
							<div class="text-center p-4 rounded-lg bg-primary">
								<h5 class="font-weight-bold text-white">${pkg.name}</h5>
								${
									pkg.version
										? `<p class="text-white ${
												pkg.description ? '' : 'mb-0'
										  }">v${pkg.version}</p>`
										: `<p class="text-white ${
												pkg.description ? '' : 'mb-0'
										  }">(unversioned)</p>`
								}
								${pkg.description ? `<p class="text-white mb-0">${pkg.description}</p>` : ''}
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

								${docs
									.map(
										({ file }) => `
									<li class="nav-item text-left">
										<a href="#" class="nav-link text-white" data-file="${file}">${
											file.startsWith('./')
												? file.substr(2)
												: file.startsWith(process.cwd())
												? file.substr(process.cwd().length + 1)
												: file
										}</a>
									</li>
								`,
									)
									.join('')}
							</ul>
						</div>

						<div class="col main h-100 p-5 overflow-auto" id="main">
							${readme.content}
						</div>
					</div>
				</div>

				<script src="https://code.jquery.com/jquery-latest.min.js"></script>
				<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.15.9/highlight.min.js"></script>
				<script>
					const main = document.querySelector('#main')
					const docs = ${JSON.stringify(
						docs.reduce(
							(docsByFile, { file, description, docs }) => {
								docsByFile[file] = renderDocsPage({ description, docs })
								return docsByFile
							},
							{
								__README__: readme.content,
							},
						),
						null,
						'\t',
					)}

					function updateAfterRender() {
						document.querySelectorAll('pre > code').forEach(block => {
							hljs.highlightBlock(block)
						})

						$(main).animate({
							scrollTop: 0,
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
				</script>
			</body>
		</html>`,
	)
}

/**
 * Executes documentation generation on all source files
 * part of the local repository.
 */
export async function docCommand() {
	const docs = []
	const wg = new WaitGroup()

	for await (const { file, type } of findSourceFiles({
		cache: {},
		directory: path.join(process.cwd(), 'src'),
	})) {
		if (type === 'source') {
			wg.add(
				generateDocs(file).then(doc => {
					if (doc.description || doc.docs.length > 0) {
						docs.push(doc)
					}
				}),
			)
		}
	}

	await wg.wait()
	const readme = {
		headings: [],
	}
	const renderer = new marked.Renderer()

	renderer.heading = function(text, level, _, slugger) {
		const slug = slugger.slug(text)
		readme.headings.push({
			text,
			slug,
		})
		return `<h${level} id="${slug}"><a class="text-body" href="#${slug}">${text}</a></h${level}>`
	}

	readme.content = marked(await readFile('./README.md', 'utf8'), {
		renderer,
	})
	await writeDocs(readme, docs)
}