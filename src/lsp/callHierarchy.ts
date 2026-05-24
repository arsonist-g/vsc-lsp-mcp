import * as vscode from 'vscode'
import type { LspExecutionScope } from '../mcp/executor'
import { logger } from '../utils/logger'
import { getDocument } from './tools'

/**
 * Prepare call hierarchy at a given position.
 *
 * @param uri - The document URI
 * @param line - Line number (0-based)
 * @param character - Character offset (0-based)
 * @returns Raw VSCode CallHierarchyItem or array
 */
export async function prepareCallHierarchy(
  uri: string,
  line: number,
  character: number,
  scope?: LspExecutionScope,
): Promise<vscode.CallHierarchyItem | readonly vscode.CallHierarchyItem[]> {
  try {
    const document = await getDocument(uri, scope)
    if (!document) {
      throw new Error(`Failed to find document: ${uri}`)
    }

    const position = new vscode.Position(line, character)

    logger.info(`Preparing call hierarchy: ${uri} line:${line} col:${character}`)

    return await vscode.commands.executeCommand<
      vscode.CallHierarchyItem | vscode.CallHierarchyItem[]
    >(
      'vscode.prepareCallHierarchy',
      document.uri,
      position,
    )
  }
  catch (error) {
    logger.error('Failed to prepare call hierarchy', error)
    throw error
  }
}

/**
 * Get incoming calls (callers) for a symbol at a given position.
 * Internally calls prepareCallHierarchy first, then provideIncomingCalls for each item.
 *
 * @param uri - The document URI
 * @param line - Line number (0-based)
 * @param character - Character offset (0-based)
 * @returns Raw VSCode CallHierarchyIncomingCall array
 */
export async function getIncomingCalls(
  uri: string,
  line: number,
  character: number,
  scope?: LspExecutionScope,
): Promise<vscode.CallHierarchyIncomingCall[]> {
  try {
    const document = await getDocument(uri, scope)
    if (!document) {
      throw new Error(`Failed to find document: ${uri}`)
    }

    const position = new vscode.Position(line, character)

    logger.info(`Getting incoming calls: ${uri} line:${line} col:${character}`)

    const items = await vscode.commands.executeCommand<
      vscode.CallHierarchyItem | vscode.CallHierarchyItem[]
    >(
      'vscode.prepareCallHierarchy',
      document.uri,
      position,
    )

    if (!items) {
      return []
    }

    const itemList = Array.isArray(items) ? items : [items]
    const allCalls: vscode.CallHierarchyIncomingCall[] = []

    for (const item of itemList) {
      const calls = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
        'vscode.provideIncomingCalls',
        item,
      )
      if (calls) {
        allCalls.push(...calls)
      }
    }

    return allCalls
  }
  catch (error) {
    logger.error('Failed to get incoming calls', error)
    throw error
  }
}

/**
 * Get outgoing calls (callees) for a symbol at a given position.
 * Internally calls prepareCallHierarchy first, then provideOutgoingCalls for each item.
 *
 * @param uri - The document URI
 * @param line - Line number (0-based)
 * @param character - Character offset (0-based)
 * @returns Raw VSCode CallHierarchyOutgoingCall array
 */
export async function getOutgoingCalls(
  uri: string,
  line: number,
  character: number,
  scope?: LspExecutionScope,
): Promise<vscode.CallHierarchyOutgoingCall[]> {
  try {
    const document = await getDocument(uri, scope)
    if (!document) {
      throw new Error(`Failed to find document: ${uri}`)
    }

    const position = new vscode.Position(line, character)

    logger.info(`Getting outgoing calls: ${uri} line:${line} col:${character}`)

    const items = await vscode.commands.executeCommand<
      vscode.CallHierarchyItem | vscode.CallHierarchyItem[]
    >(
      'vscode.prepareCallHierarchy',
      document.uri,
      position,
    )

    if (!items) {
      return []
    }

    const itemList = Array.isArray(items) ? items : [items]
    const allCalls: vscode.CallHierarchyOutgoingCall[] = []

    for (const item of itemList) {
      const calls = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
        'vscode.provideOutgoingCalls',
        item,
      )
      if (calls) {
        allCalls.push(...calls)
      }
    }

    return allCalls
  }
  catch (error) {
    logger.error('Failed to get outgoing calls', error)
    throw error
  }
}
