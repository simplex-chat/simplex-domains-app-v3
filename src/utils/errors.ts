import {
  BaseError,
  ContractErrorName,
  decodeErrorResult,
  EstimateGasExecutionError,
  formatEther,
  parseAbi,
  RawContractError,
  RpcError,
  RpcRequestError,
} from 'viem'

import {
  dnsRegistrarErrors,
  ethRegistrarControllerErrors,
  nameWrapperErrors,
} from '@ensdomains/ensjs/contracts'

type ReadableErrorType = 'insufficientFunds' | 'contract' | 'unknown'
type ReadableError = {
  message: string
  type: ReadableErrorType
}

export const getViemRevertErrorData = (err: unknown) => {
  if (!(err instanceof BaseError)) return undefined
  const error = err.walk() as RawContractError
  return typeof error.data === 'object' ? error.data.data : error.data
}

// SNRC: the SimplexController (deployed under the ETHRegistrarController key) adds
// custom errors that are not in ensjs's bundled ABIs. Without these, a register()
// revert (e.g. NftRequired, NameReserved, NameTooShort) can't be decoded and surfaces
// as "Execution reverted for an unknown reason".
const simplexControllerErrors = parseAbi([
  'error CommitmentNotFound(bytes32 commitment)',
  'error CommitmentTooNew(bytes32 commitment, uint256 minimumCommitmentTimestamp, uint256 currentTimestamp)',
  'error CommitmentTooOld(bytes32 commitment, uint256 maximumCommitmentTimestamp, uint256 currentTimestamp)',
  'error NameNotAvailable(string name)',
  'error ReasonRequired()',
  'error DurationTooShort(uint256 duration)',
  'error DurationTooLong(uint256 duration)',
  'error ResolverRequiredWhenDataSupplied()',
  'error ReverseRecordNotSupported()',
  'error UnexpiredCommitmentExists(bytes32 commitment)',
  'error InsufficientValue()',
  'error TransferFailed()',
  'error NameNotReserved(string name)',
  'error MinCommitmentAgeZero()',
  'error MaxCommitmentAgeTooLow()',
  'error MaxCommitmentAgeTooHigh()',
  'error NameTooShort(string name, uint8 minLength)',
  'error NameReserved(string name)',
  'error NftRequired()',
  'error MinCharLengthCanOnlyDecrease()',
  'error MinCharLengthZero()',
  'error NftGateCanOnlyBeDisabled()',
  'error ZeroAddress()',
  'error NotBeneficiary()',
  'error NotOwnerOrBeneficiary()',
  'error AlreadyFrozen()',
  'error Frozen()',
  'error PublicSalesClosed()',
  'error OwnerMustBeCaller()',
  'error NotSponsor()',
  'error ReentrantCall()',
])

const snrcErrors = parseAbi([
  'error LabelTooLong(uint256 length, uint256 max)',
  'error TransferToSelf()',
  'error SignatureExpired()',
  'error InvalidNonce()',
  'error InvalidSignature()',
  'error NotNameOwner()',
  'error RecipientMustBeCaller()',
  'error NotOffered()',
  'error NotParentOwner()',
  'error EmptyLabel()',
  'error NotBaseRegistrar()',
  'error AlreadyInitialised()',
  'error StaleSubnameMustBePurged(bytes32 node)',
  'error NotSubnameRegistrar()',
  'error NodeNotOwnedByRegistrar()',
  'error InvalidEVMAddress(bytes addressBytes)',
  'error InvalidPriceFeed(int256 answer)',
  'error TermsMismatch(bytes32 accepted, bytes32 current)',
  'error TermsNotAccepted(string name)',
  'error DisputePeriodNotOver(uint256 id)',
  'error NotHolder(string name)',
  'error ExpiryMismatch(uint256 named, uint256 current)',
])

export const allContractErrors = [
  ...ethRegistrarControllerErrors,
  ...nameWrapperErrors,
  ...dnsRegistrarErrors,
  ...simplexControllerErrors,
  ...snrcErrors,
]

const insufficientFundsRegex =
  /insufficient funds for gas \* price \+ value: address (?<address>0x[a-fA-F0-9]{40}) have (?<availableBalance>\d*) want (?<requiredBalance>\d*)/

const getEstimateGasExecutionErrorMessage = (err: EstimateGasExecutionError) => {
  const originError = err.walk()
  const data = insufficientFundsRegex.exec(originError.message)
  if (data?.groups) {
    const { requiredBalance } = data.groups
    return {
      message: `Wallet balance too low. Minimum required balance: ${formatEther(
        BigInt(requiredBalance),
      )} ETH`,
      type: 'insufficientFunds',
    } as const
  }

  return null
}

const getRpcErrorMessage = (err: RpcError | RpcRequestError) => {
  if (err.details?.toLowerCase().includes('insufficient funds'))
    return {
      message: 'Not enough ETH on Ethereum Mainnet',
      type: 'contract',
    } satisfies ReadableError

  return {
    message: err.details || err.shortMessage,
    type: 'contract',
  } satisfies ReadableError
}

export type RevertErrorName = ContractErrorName<typeof allContractErrors> | 'Error' | 'Panic'

export const getRevertErrorName = (err: unknown): RevertErrorName | undefined => {
  const data = getViemRevertErrorData(err)
  if (!data) return undefined
  try {
    return decodeErrorResult({ abi: allContractErrors, data }).errorName
  } catch {
    // Unknown selector (error not in any bundled ABI): degrade gracefully. Without
    // this, decodeErrorResult throws AbiErrorSignatureNotFoundError, which on the
    // post-mining path swallowed the error entirely (no message rendered).
    return undefined
  }
}

export const getReadableError = (err: unknown): ReadableError | null => {
  if (err instanceof EstimateGasExecutionError) {
    // Insufficient-funds has its own message; any other estimate-time revert falls
    // through to the revert-data decode below so the real contract error surfaces
    // instead of viem's generic "Execution reverted for an unknown reason".
    const insufficientFunds = getEstimateGasExecutionErrorMessage(err)
    if (insufficientFunds) return insufficientFunds
  }
  const errorName = getRevertErrorName(err)
  if (errorName) return { message: errorName, type: 'contract' }
  if (err instanceof RpcError || err instanceof RpcRequestError) return getRpcErrorMessage(err)
  return null
}
