import { encodeErrorResult, parseAbi, RawContractError, RpcRequestError } from 'viem'
import { describe, expect, it } from 'vitest'

import { getReadableError } from './errors'

describe('getReadableError', () => {
  it('names the error of a renewal that reverts during the dispute period', () => {
    const data = encodeErrorResult({
      abi: parseAbi(['error DisputePeriodNotOver(uint256 id)']),
      errorName: 'DisputePeriodNotOver',
      args: [1n],
    })
    expect(getReadableError(new RawContractError({ data }))).toEqual({
      message: 'DisputePeriodNotOver',
      type: 'contract',
    })
  })

  it.each([
    ['NotHolder', ['alice']],
    ['ExpiryMismatch', [1n, 2n]],
  ] as const)('names the error %s of a renewal that reverts', (errorName, args) => {
    const abi = parseAbi([
      'error NotHolder(string name)',
      'error ExpiryMismatch(uint256 named, uint256 current)',
    ])
    const data = encodeErrorResult({ abi, errorName, args } as never)
    expect(getReadableError(new RawContractError({ data }))?.message).toBe(errorName)
  })

  it('names the error in the revert data that the node returns', () => {
    const data = encodeErrorResult({
      abi: parseAbi(['error NotHolder(string name)']),
      errorName: 'NotHolder',
      args: ['alice'],
    })
    const error = new RpcRequestError({
      body: {},
      url: '',
      error: { code: 3, message: 'execution reverted', data },
    } as never)
    expect(getReadableError(error)).toEqual({ message: 'NotHolder', type: 'contract' })
  })

  it("gives the node's message for a failed request without revert data", () => {
    const error = new RpcRequestError({
      body: {},
      url: '',
      error: { code: -32000, message: 'header not found' },
    })
    expect(getReadableError(error)).toEqual({ message: 'header not found', type: 'contract' })
  })
})
