import { QueryFunctionContext } from '@tanstack/react-query'

import { ConfigWithEns, CreateQueryKey } from '@app/types'

type QueryKey = CreateQueryKey<{ name: string }, 'getDisputeEnd', 'standard'>

export const getDisputeEndQueryFn =
  (_config: ConfigWithEns) =>
  async (_context: QueryFunctionContext<QueryKey>): Promise<Date | null> =>
    null

export const useDisputeEnd = (_parameters: { name: string }) => ({
  data: undefined as Date | undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
})
