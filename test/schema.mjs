/**
 * Structural check for every tool this plugin registers: `register()` passes
 * `parameters` straight through as JSON Schema to the model request, so a
 * property-level `required: true` (the defineTool spec DSL) becomes an invalid
 * request and the provider rejects the whole turn.
 *
 * Run with: node test/schema.mjs
 */
import { apply } from '../index.js'

const tools = []
const ctx = {
  tools: { register: definition => tools.push(definition) },
  effect: () => () => {},
}

apply(ctx, {})
console.log(`registered ${tools.length}: ${tools.map(tool => tool.name).join(', ')}`)

const problems = []

function walk(node, path) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, `${path}[${index}]`))
    return
  }
  for (const [key, value] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key
    if (key === 'required') {
      if (!Array.isArray(value)) problems.push(`${here}: required must be an array, got ${JSON.stringify(value)}`)
      else if (!value.every(item => typeof item === 'string')) problems.push(`${here}: required must hold strings`)
      else {
        const siblings = Object.keys(node.properties ?? {})
        for (const name of value) {
          if (!siblings.includes(name)) problems.push(`${here}: "${name}" is required but not declared in properties`)
        }
      }
      continue
    }
    walk(value, here)
  }
}

for (const tool of tools) {
  const schema = tool.parameters
  if (!schema || schema.type !== 'object') {
    problems.push(`${tool.name}: parameters must be an object schema`)
    continue
  }
  if (!schema.properties) problems.push(`${tool.name}: parameters.properties is missing`)
  if (schema.additionalProperties !== false) problems.push(`${tool.name}: parameters.additionalProperties should be false`)
  walk(schema, tool.name)
  const text = JSON.stringify(schema)
  if (text.includes('"required":true') || text.includes('"required":false')) {
    problems.push(`${tool.name}: found a boolean required in the serialized schema`)
  }
  if (tool.description?.length < 20) problems.push(`${tool.name}: description is too short`)
}

if (problems.length) {
  console.error('\nFAILED:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log('OK: every registered parameter schema is valid JSON Schema')
}
