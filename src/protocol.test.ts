import { describe, expect, it } from 'vitest'
import { validateExecuteLspInput, validateRenameResourceInput } from './protocol'

describe('execute_lsp input contract', () => {
  it.each(['/home/user/file.ts', 'C:/work/file.ts', 'C:\\work\\file.ts', 'jdt://contents/java.base/String.class'])(
    'accepts supported absolute path or URI: %s',
    (uri) => {
      expect(() => validateExecuteLspInput({ operation: 'document_symbols', uri })).not.toThrow()
    },
  )

  it.each([0, -1])('rejects non-positive 1-based line: %s', (line) => {
    expect(() => validateExecuteLspInput({
      operation: 'hover',
      uri: '/code/main.ts',
      line,
      character: 1,
    })).toThrow('1-based positive integer')
  })

  it.each([0, -1])('rejects non-positive 1-based character: %s', (character) => {
    expect(() => validateExecuteLspInput({
      operation: 'hover',
      uri: '/code/main.ts',
      line: 1,
      character,
    })).toThrow('1-based positive integer')
  })

  it('requires a non-empty workspace symbol query', () => {
    expect(() => validateExecuteLspInput({
      operation: 'workspace_symbols',
      uri: '/code',
      query: '  ',
    })).toThrow('non-empty "query"')
  })

  it.each([0, -1])('rejects non-positive timeoutMs for refresh operations: %s', (timeoutMs) => {
    expect(() => validateExecuteLspInput({
      operation: 'diagnostics_refresh',
      uri: '/code/main.ts',
      timeoutMs,
    })).toThrow('positive integer')
  })

  it('accepts refresh operations without timeoutMs', () => {
    expect(() => validateExecuteLspInput({
      operation: 'workspace_diagnostics_refresh',
      uri: '/code',
    })).not.toThrow()
  })

  it('rejects relative paths and non-JDT class file requests', () => {
    expect(() => validateExecuteLspInput({ operation: 'document_symbols', uri: 'src/main.ts' }))
      .toThrow('absolute Unix/Windows path')
    expect(() => validateExecuteLspInput({ operation: 'class_file_contents', uri: '/code/String.class' }))
      .toThrow('jdt://')
  })
})

describe('rename_resource input contract', () => {
  it('accepts native absolute paths and file URIs', () => {
    expect(() => validateRenameResourceInput({
      oldUri: '/code/a.ts',
      newUri: 'file:///code/b.ts',
    })).not.toThrow()
  })

  it('rejects relative paths and non-file URI schemes', () => {
    expect(() => validateRenameResourceInput({ oldUri: 'a.ts', newUri: '/code/b.ts' }))
      .toThrow('native absolute path')
    expect(() => validateRenameResourceInput({ oldUri: '/code/a.ts', newUri: 'untitled:item' }))
      .toThrow('file URI')
  })
})
