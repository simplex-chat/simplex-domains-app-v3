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
})
