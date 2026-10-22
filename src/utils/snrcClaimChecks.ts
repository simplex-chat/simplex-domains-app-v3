import {
  Address,
  decodeAbiParameters,
  encodePacked,
  Hex,
  hexToString,
  keccak256,
  labelhash,
  namehash,
  parseAbi,
  parseAbiItem,
  parseAbiParameters,
  parseEventLogs,
  stringToHex,
  toEventSelector,
  zeroAddress,
  zeroHash,
} from 'viem'
import { getLogs, readContract } from 'viem/actions'

import { getChainContractAddress } from '@ensdomains/ensjs/contracts'

import { getSnrcAddresses } from '@app/constants/chains'
import { ALLOWED_LABEL_REGEX } from '@app/hooks/useValidate'
import { ClientWithEns } from '@app/types'

const MAX_NODES = 100

const registryAbi = parseAbi([
  'function owner(bytes32 node) view returns (address)',
  'function resolver(bytes32 node) view returns (address)',
])
const controllerAbi = parseAbi([
  'function defaultResolver() view returns (address)',
  'function wasDefaultResolver(address) view returns (bool)',
])
const subnameRegistrarAbi = parseAbi([
  'function resolver() view returns (address)',
  'function childrenLength(bytes32 parentNode) view returns (uint256)',
  'function getChildren(bytes32 parentNode, uint256 start, uint256 count) view returns (bytes32[] hashes, string[] labels)',
  'function generation(bytes32 node) view returns (uint256)',
  'function generationAt(bytes32 node) view returns (uint256)',
])
const resolverAbi = parseAbi([
  'function ABI(bytes32 node, uint256 contentTypes) view returns (uint256, bytes)',
])
const newOwnerEvent = parseAbiItem(
  'event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner)',
)
const resolverEvents = parseAbi([
  'event VersionChanged(bytes32 indexed node, uint64 newVersion)',
  'event TextChanged(bytes32 indexed node, string indexed indexedKey, string key, string value)',
  'event AddressChanged(bytes32 indexed node, uint256 coinType, bytes newAddress)',
  'event ContenthashChanged(bytes32 indexed node, bytes hash)',
  'event ABIChanged(bytes32 indexed node, uint256 indexed contentType)',
  'event PubkeyChanged(bytes32 indexed node, bytes32 x, bytes32 y)',
  'event NameChanged(bytes32 indexed node, string name)',
  'event InterfaceChanged(bytes32 indexed node, bytes4 indexed interfaceID, address implementer)',
  'event DNSRecordChanged(bytes32 indexed node, bytes name, uint16 resource, bytes record)',
  'event DNSRecordDeleted(bytes32 indexed node, bytes name, uint16 resource)',
  'event DNSZonehashChanged(bytes32 indexed node, bytes lastzonehash, bytes zonehash)',
  'event DataChanged(bytes32 indexed node, string indexed indexedKey, string key, bytes indexed indexedData)',
])
const oneString = parseAbiParameters('bytes')
const twoStrings = parseAbiParameters('bytes, bytes')

export type ClaimRecord = {
  id: string
  key: string
  value: string
  keyAsBytes?: boolean
  valueAsBytes?: boolean
  valueUnread?: boolean
  resolver: Address
  inEffect: boolean
}

export type ClaimNode = {
  node: Hex
  status: 'tracked' | 'registrar' | 'ownerless' | 'untracked'
  name?: string
  owner: Address
  customResolver?: Address
  recordsUnreadable: boolean
  records: ClaimRecord[]
}

type SubtreeNode = Omit<ClaimNode, 'customResolver' | 'recordsUnreadable' | 'records'> & {
  resolver: Address
}

type RecordValue = string | (() => Promise<string | undefined>)

type RecordEntry = Omit<ClaimRecord, 'value' | 'resolver' | 'inEffect'> & {
  value?: RecordValue
}

const isPlainText = (text: string) => /^([\x21-\x7e]+( [\x21-\x7e]+)*)?$/.test(text)

// viem decodes an ABI string lossily: it drops leading NUL bytes and a byte order mark,
// and replaces invalid UTF-8. Strings from logs are therefore decoded as bytes, and shown
// as text only when they decode exactly to printable ASCII, which has no invisible or
// right-to-left characters.
const textOf = (bytes: Hex) => {
  const text = hexToString(bytes)
  const asBytes = !isPlainText(text) || stringToHex(text) !== bytes
  return { text: asBytes ? bytes : text, asBytes }
}

const unlessEmpty = (bytes: Hex, value: string = bytes) => (bytes === '0x' ? undefined : value)

const getSubtree = async (
  client: ClientWithEns,
  registry: Address,
  subnameRegistrar: Address,
  name: string,
) => {
  const contract = { address: registry, abi: registryAbi } as const
  const readRegistry = (node: Hex) =>
    Promise.all([
      readContract(client, { ...contract, functionName: 'owner', args: [node] }),
      readContract(client, { ...contract, functionName: 'resolver', args: [node] }),
    ])
  const classify = (owner: Address, liveName?: string): Pick<ClaimNode, 'status' | 'name'> => {
    if (owner.toLowerCase() !== subnameRegistrar.toLowerCase())
      return { status: owner === zeroAddress ? 'ownerless' : 'untracked' }
    return liveName ? { status: 'tracked', name: liveName } : { status: 'registrar' }
  }
  const registrar = { address: subnameRegistrar, abi: subnameRegistrarAbi } as const
  const getLiveNames = async (parent: Hex, parentName: string) => {
    const count = await readContract(client, {
      ...registrar,
      functionName: 'childrenLength',
      args: [parent],
    })
    const [hashes, labels] = await readContract(client, {
      ...registrar,
      functionName: 'getChildren',
      args: [parent, 0n, count],
    })
    const children = hashes.map((hash) =>
      keccak256(encodePacked(['bytes32', 'bytes32'], [parent, hash])),
    )
    const [parentGeneration, ...generations] = await Promise.all([
      readContract(client, { ...registrar, functionName: 'generation', args: [parent] }),
      ...children.map((child) =>
        readContract(client, { ...registrar, functionName: 'generationAt', args: [child] }),
      ),
    ])
    return children.flatMap((child, i) =>
      generations[i] === parentGeneration &&
      labelhash(labels[i]) === hashes[i] &&
      ALLOWED_LABEL_REGEX.test(labels[i])
        ? [[child, `${labels[i]}.${parentName}`] as const]
        : [],
    )
  }

  const root = namehash(name)
  const [rootOwner, rootResolver] = await readRegistry(root)
  const rootNode: SubtreeNode = {
    node: root,
    status: 'tracked',
    name,
    owner: rootOwner,
    resolver: rootResolver,
  }
  const subtree = [rootNode]
  let parents = [rootNode]
  while (parents.length > 0) {
    // eslint-disable-next-line no-await-in-loop
    const logs = await getLogs(client, {
      address: registry,
      event: newOwnerEvent,
      args: { node: parents.map(({ node }) => node) },
      fromBlock: 'earliest',
      strict: true,
    })
    const children = [
      ...new Set(
        logs.map(({ args }) =>
          keccak256(encodePacked(['bytes32', 'bytes32'], [args.node, args.label])),
        ),
      ),
    ]
    if (children.length === 0) break
    if (subtree.length + children.length > MAX_NODES) return { subtree, complete: false }
    // eslint-disable-next-line no-await-in-loop
    const [liveNames, registryRecords] = await Promise.all([
      Promise.all(
        parents.flatMap((parent) => (parent.name ? [getLiveNames(parent.node, parent.name)] : [])),
      ),
      Promise.all(children.map(readRegistry)),
    ])
    const names = new Map(liveNames.flat())
    parents = children.map((node, i) => {
      const [owner, resolver] = registryRecords[i]
      return { node, ...classify(owner, names.get(node)), owner, resolver }
    })
    subtree.push(...parents)
  }
  return { subtree, complete: true }
}

const getRecords = async (
  client: ClientWithEns,
  resolver: Address,
  nodes: Hex[],
  isDefault: boolean,
) => {
  const logs = await client.request({
    method: 'eth_getLogs',
    params: [
      {
        address: resolver,
        topics: [resolverEvents.map((event) => toEventSelector(event)), nodes],
        fromBlock: 'earliest',
      },
    ],
  })
  const contract = { address: resolver, abi: resolverAbi } as const
  const records = new Map(nodes.map((node) => [node, new Map<string, RecordEntry>()]))
  for (const { eventName, args, data } of parseEventLogs({ abi: resolverEvents, logs })) {
    const current = records.get(args.node)!
    const set = (id: string, value: RecordValue | undefined, entry: Partial<RecordEntry> = {}) =>
      current.set(id, { id, key: id, value, ...entry })
    switch (eventName) {
      case 'VersionChanged':
        current.clear()
        break
      case 'TextChanged': {
        const [keyBytes, valueBytes] = decodeAbiParameters(twoStrings, data)
        const key = textOf(keyBytes)
        const value = textOf(valueBytes)
        set(`text ${keyBytes}`, unlessEmpty(valueBytes, value.text), {
          key: `text ${key.text}`,
          keyAsBytes: key.asBytes,
          valueAsBytes: value.asBytes,
        })
        break
      }
      case 'AddressChanged':
        set(`address ${args.coinType}`, unlessEmpty(args.newAddress))
        break
      case 'ContenthashChanged':
        set('contenthash', unlessEmpty(args.hash))
        break
      case 'ABIChanged':
        // A getter on a resolver the holder chose can return a different value on every block.
        if (!isDefault) set(`ABI ${args.contentType}`, '', { valueUnread: true })
        else
          set(`ABI ${args.contentType}`, async () => {
            const [, abi] = await readContract(client, {
              ...contract,
              functionName: 'ABI',
              args: [args.node, args.contentType],
            })
            return unlessEmpty(abi)
          })
        break
      case 'PubkeyChanged':
        set(
          'pubkey',
          args.x === zeroHash && args.y === zeroHash ? undefined : `${args.x} ${args.y}`,
        )
        break
      case 'NameChanged': {
        const [nameBytes] = decodeAbiParameters(oneString, data)
        const name = textOf(nameBytes)
        set('name', unlessEmpty(nameBytes, name.text), { valueAsBytes: name.asBytes })
        break
      }
      case 'InterfaceChanged':
        set(
          `interface ${args.interfaceID}`,
          args.implementer === zeroAddress ? undefined : args.implementer,
        )
        break
      case 'DNSRecordChanged':
        set(`DNS ${args.name} ${args.resource}`, args.record)
        break
      case 'DNSRecordDeleted':
        set(`DNS ${args.name} ${args.resource}`, undefined)
        break
      case 'DNSZonehashChanged':
        set('DNS zonehash', unlessEmpty(args.zonehash))
        break
      case 'DataChanged': {
        const [keyBytes] = decodeAbiParameters(oneString, data)
        const key = textOf(keyBytes)
        set(
          `data ${keyBytes}`,
          args.indexedData === keccak256('0x') ? undefined : `keccak256 ${args.indexedData}`,
          { key: `data ${key.text}`, keyAsBytes: key.asBytes },
        )
        break
      }
      default:
    }
  }
  return new Map(
    await Promise.all(
      [...records].map(async ([node, current]) => {
        const read = await Promise.all(
          [...current.values()].map(async ({ value, ...record }) => ({
            ...record,
            value: typeof value === 'function' ? await value() : value,
          })),
        )
        return [
          node,
          read.flatMap(({ value, ...record }) =>
            value === undefined ? [] : [{ ...record, value }],
          ),
        ] as const
      }),
    ),
  )
}

export const getClaimChecks = async (client: ClientWithEns, name: string) => {
  const registry = getChainContractAddress({ client, contract: 'ensRegistry' })
  const { ETHRegistrarController, SubnameRegistrar } = getSnrcAddresses(client.chain.id)
  const controller = { address: ETHRegistrarController as Address, abi: controllerAbi } as const

  const [{ subtree, complete }, defaultResolver, subnameResolver] = await Promise.all([
    getSubtree(client, registry, SubnameRegistrar as Address, name),
    readContract(client, { ...controller, functionName: 'defaultResolver' }),
    readContract(client, {
      address: SubnameRegistrar as Address,
      abi: subnameRegistrarAbi,
      functionName: 'resolver',
    }),
  ])
  const nodes = subtree.map(({ node }) => node)
  const defaultResolvers = [...new Set([defaultResolver, subnameResolver])].filter(
    (resolver) => resolver !== zeroAddress,
  )
  const scanResolver = async (resolver: Address) => {
    const isDefault =
      defaultResolvers.includes(resolver) ||
      (await readContract(client, {
        ...controller,
        functionName: 'wasDefaultResolver',
        args: [resolver],
      }))
    const scan = getRecords(client, resolver, nodes, isDefault)
    const records = isDefault ? await scan : await scan.catch(() => undefined)
    return { isDefault, records }
  }
  const scans = new Map(
    await Promise.all(
      [...new Set([...defaultResolvers, ...subtree.map(({ resolver }) => resolver)])]
        .filter((resolver) => resolver !== zeroAddress)
        .map(async (resolver) => [resolver, await scanResolver(resolver)] as const),
    ),
  )
  const recordsOn = (resolver: Address, node: Hex, inEffect: boolean) =>
    (scans.get(resolver)?.records?.get(node) ?? []).map((record) => ({
      ...record,
      resolver,
      inEffect,
    }))

  const [{ node: root }] = subtree
  const claimNodes = subtree
    .map(({ resolver, ...entry }): ClaimNode => {
      const scan = scans.get(resolver)
      return {
        ...entry,
        customResolver: scan?.isDefault === false ? resolver : undefined,
        recordsUnreadable: !!scan && !scan.records,
        records: [
          ...recordsOn(resolver, entry.node, true),
          ...defaultResolvers
            .filter((other) => other !== resolver)
            .flatMap((other) => recordsOn(other, entry.node, false)),
        ],
      }
    })
    .filter(
      (n) =>
        n.node === root || n.owner !== zeroAddress || !!n.customResolver || n.records.length > 0,
    )
  return {
    nodes: claimNodes,
    complete,
    digest: keccak256(stringToHex(JSON.stringify({ claimNodes, complete }))),
  }
}
