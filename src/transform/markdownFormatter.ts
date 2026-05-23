import type { Formatter } from './types'

/**
 * MarkdownFormatter converts flattened LSP data into LLM-friendly Markdown text.
 *
 * Design principles:
 * - No tables (LLM-unfriendly and token-wasteful)
 * - Concise bullet-oriented structure
 * - Inline code for identifiers and file paths
 * - Minimal boilerplate to maximise informational density
 */
export class MarkdownFormatter implements Formatter {
  formatHover(contents: string[]): string {
    if (contents.length === 0) {
      return '## Hover\n\nNo hover information available.'
    }
    return `## Hover\n\n${contents.join('\n\n---\n\n')}`
  }

  formatCompletions(items: Record<string, any>[]): string {
    if (items.length === 0) {
      return '## Completions\n\nNo completions available.'
    }

    const lines = items.map((item) => {
      let line = `- \`${item.label}\``
      if (item.kind)
        line += ` (${item.kind})`
      if (item.detail)
        line += `: ${item.detail}`
      return line
    })

    return `## Completions\n\n${lines.join('\n')}`
  }

  formatLocations(locations: Record<string, any>[], label = 'Locations'): string {
    if (locations.length === 0) {
      return `## ${label}\n\nNo ${label.toLowerCase()} found.`
    }

    const grouped: Record<string, string[]> = {}
    for (const loc of locations) {
      if (!grouped[loc.file])
        grouped[loc.file] = []
      grouped[loc.file].push(loc.range)
    }

    const lines = Object.entries(grouped).map(([file, ranges]) =>
      `- \`${file}\`: ${ranges.map(r => `line ${r}`).join(', ')}`,
    )

    return `## ${label}\n\n${lines.join('\n')}`
  }

  formatRename(result: Record<string, any>): string {
    return `## Rename\n\nRenamed to \`${result.newName}\` across ${result.filesChanged} file(s) (${result.totalEdits} total edit(s)).`
  }

  formatClassFile(text: string): string {
    const escaped = text.replace(/```/g, '\\`\\`\\`')
    return `## Class File Contents\n\n\`\`\`java\n${escaped}\n\`\`\``
  }

  formatDocumentSymbols(symbols: Record<string, any>[]): string {
    if (symbols.length === 0)
      return '## Document Symbols\n\nNo symbols found.'

    const lines = symbols.map(s => this._renderFlatSymbol(s, 0))
    return `## Document Symbols\n\n${lines.join('\n')}`
  }

  formatWorkspaceSymbols(symbols: Record<string, any>[]): string {
    if (symbols.length === 0)
      return '## Workspace Symbols\n\nNo symbols found.'
    const grouped: Record<string, any[]> = {}

    for (const s of symbols) {
      const { file, ...rest } = s
      if (!file)
        continue
      if (!grouped[file])
        grouped[file] = []
      grouped[file].push(rest)
    }

    const lines = Object.entries(grouped).flatMap(([file, items]) => {
      const itemLines = items.map((item) => {
        const parts: string[] = [`line ${item.range}`]
        if (item.containerName)
          parts.push(`nested in \`${item.containerName}\``)
        return `  - \`${item.name}\` (${item.kind}): ${parts.join(', ')}`
      })
      return [`\`${file}\``, ...itemLines]
    })

    return `## Workspace Symbols\n\n${lines.join('\n')}`
  }


  formatDiagnostics(diagnostics: Record<string, any>[]): string {
    if (diagnostics.length === 0)
      return '## Problems\n\nNo problems found.'

    const grouped: Record<string, any[]> = {}
    for (const diagnostic of diagnostics) {
      const { file, ...rest } = diagnostic
      if (!file)
        continue
      if (!grouped[file])
        grouped[file] = []
      grouped[file].push(rest)
    }

    const lines = Object.entries(grouped).flatMap(([file, items]) => {
      const itemLines = items.map((item) => {
        const parts: string[] = [`${item.severity} at ${item.range}`]
        if (item.source)
          parts.push(`source: ${item.source}`)
        if (item.code !== undefined)
          parts.push(`code: ${typeof item.code === 'object' ? item.code.value : item.code}`)
        if (item.tags?.length)
          parts.push(`tags: ${item.tags.join(', ')}`)
        return `  - ${parts.join(', ')}: ${item.message}`
      })
      return [`\`${file}\``, ...itemLines]
    })

    return `## Problems\n\n${lines.join('\n')}`
  }

  formatCallHierarchyItems(items: Record<string, any>[]): string {
    if (items.length === 0)
      return '## Call Hierarchy\n\nNo items found.'

    const grouped: Record<string, any[]> = {}
    for (const item of items) {
      const { file, ...rest } = item
      if (!file)
        continue
      if (!grouped[file])
        grouped[file] = []
      grouped[file].push(rest)
    }

    const lines = Object.entries(grouped).flatMap(([file, items]) => {
      const itemLines = items.map((item) => {
        const parts: string[] = [`line ${item.range}`]
        if (item.namePosition)
          parts.push(`name at ${item.namePosition}`)
        if (item.detail)
          parts.push(`detail: ${item.detail}`)
        return `  - \`${item.name}\` (${item.kind}): ${parts.join(', ')}`
      })
      return [`\`${file}\``, ...itemLines]
    })

    return `## Call Hierarchy\n\n${lines.join('\n')}`
  }

  formatIncomingCalls(calls: Record<string, any>[]): string {
    if (calls.length === 0)
      return '## Incoming Calls\n\nNo incoming calls found.'
    const grouped: Record<string, any[]> = {}

    for (const call of calls) {
      const file = call.caller?.file
      if (!file)
        continue
      if (!grouped[file])
        grouped[file] = []
      grouped[file].push(call)
    }

    const lines = Object.entries(grouped).flatMap(([file, items]) => {
      const itemLines = items.map((call) => {
        const parts: string[] = [`line ${call.caller.range}`]
        if (call.caller.namePosition)
          parts.push(`name at ${call.caller.namePosition}`)
        if (call.callSites?.length)
          parts.push(`called at: ${call.callSites.join(', ')}`)
        return `  - \`${call.caller.name}\` (${call.caller.kind}): ${parts.join(', ')}`
      })
      return [`\`${file}\``, ...itemLines]
    })

    return `## Incoming Calls\n\n${lines.join('\n')}`
  }

  formatOutgoingCalls(calls: Record<string, any>[]): string {
    if (calls.length === 0)
      return '## Outgoing Calls\n\nNo outgoing calls found or operation not supported.'
    const grouped: Record<string, any[]> = {}

    for (const call of calls) {
      const file = call.callee?.file
      if (!file)
        continue
      if (!grouped[file])
        grouped[file] = []
      grouped[file].push(call)
    }

    const lines = Object.entries(grouped).flatMap(([file, items]) => {
      const itemLines = items.map((call) => {
        const parts: string[] = [`line ${call.callee.range}`]
        if (call.callee.namePosition)
          parts.push(`name at ${call.callee.namePosition}`)
        if (call.callSites?.length)
          parts.push(`called at: ${call.callSites.join(', ')}`)
        return `  - \`${call.callee.name}\` (${call.callee.kind}): ${parts.join(', ')}`
      })
      return [`\`${file}\``, ...itemLines]
    })

    return `## Outgoing Calls\n\n${lines.join('\n')}`
  }

  /**
   * Recursively render a flattened symbol tree as a Markdown bullet line.
   *
   * @param sym - Flattened symbol object ({name, kind, range?, namePosition?, detail?, containerName?, children?})
   * @param depth - Current indentation level
   * @returns Markdown bullet string
   */
  private _renderFlatSymbol(sym: Record<string, any>, depth: number = 0): string {
    const indent = '  '.repeat(depth)
    const parts: string[] = []
    if (sym.range)
      parts.push(`line ${sym.range}`)
    if (sym.namePosition)
      parts.push(`name at ${sym.namePosition}`)
    if (sym.detail)
      parts.push(`detail: ${sym.detail}`)
    if (sym.containerName)
      parts.push(`nested in \`${sym.containerName}\``)

    let line = `${indent}- \`${sym.name}\` (${sym.kind})`
    if (parts.length > 0)
      line += `: ${parts.join(', ')}`

    if (sym.children && sym.children.length > 0) {
      const childLines = sym.children.map((c: Record<string, any>) => this._renderFlatSymbol(c, depth + 1))
      return `${line}\n${childLines.join('\n')}`
    }

    return line
  }
}
