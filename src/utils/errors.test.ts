import { encodeErrorResult, parseAbi, RawContractError } from 'viem'
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
  ] as const)('names the renewal refusal %s', (errorName, args) => {
    const abi = parseAbi([
      'error NotHolder(string name)',
      'error ExpiryMismatch(uint256 named, uint256 current)',
    ])
    const data = encodeErrorResult({ abi, errorName, args } as never)
    expect(getReadableError(new RawContractError({ data }))?.message).toBe(errorName)
  })
})
