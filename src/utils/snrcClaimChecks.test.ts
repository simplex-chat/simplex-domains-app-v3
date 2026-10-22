import {
  Address,
  encodeAbiParameters,
  encodeEventTopics,
  encodePacked,
  Hex,
  keccak256,
  labelhash,
  namehash,
  parseAbi,
  stringToHex,
  zeroAddress,
} from 'viem'
import { getLogs, readContract } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientWithEns } from '@app/types'

import { getClaimChecks } from './snrcClaimChecks'

const REGISTRY = '0x1000000000000000000000000000000000000001'
const CONTROLLER = '0x1000000000000000000000000000000000000002'
const DEFAULT_RESOLVER = '0x1000000000000000000000000000000000000003'
const CUSTOM_RESOLVER = '0x1000000000000000000000000000000000000004'
const OLD_RESOLVER = '0x1000000000000000000000000000000000000006'
const SUBNAME_REGISTRAR = '0x1000000000000000000000000000000000ABCDEF'
const HOLDER = '0x2000000000000000000000000000000000000002'

// test/textencoder-setup.mts encodes each UTF-16 code unit as one byte; these cases need UTF-8.
vi.hoisted(() => {
  globalThis.TextEncoder = Object.getPrototypeOf(globalThis.TextEncoder)
})

vi.mock('viem/actions')
vi.mock('@ensdomains/ensjs/contracts', () => ({ getChainContractAddress: () => REGISTRY }))
vi.mock('@app/constants/chains', () => ({
  getSnrcAddresses: () => ({
    ETHRegistrarController: CONTROLLER,
    SubnameRegistrar: SUBNAME_REGISTRAR.toLowerCase(),
  }),
}))

const mockGetLogs = vi.mocked(getLogs)
const mockReadContract = vi.mocked(readContract)

const events = parseAbi([
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
  'event AddrChanged(bytes32 indexed node, address a)',
])

const log = (
  node: Hex,
  eventName: (typeof events)[number]['name'],
  types: string[],
  values: unknown[],
  indexed: Record<string, unknown> = {},
) => ({
  topics: encodeEventTopics({ abi: events, eventName, args: { node, ...indexed } } as never),
  data: encodeAbiParameters(
    types.map((type) => ({ type })),
    values as never,
  ),
})
const text = (node: Hex, key: string, value: string) =>
  log(node, 'TextChanged', ['string', 'string'], [key, value], { indexedKey: key })
const address = (node: Hex, coinType: bigint, newAddress: Hex) =>
  log(node, 'AddressChanged', ['uint256', 'bytes'], [coinType, newAddress])
const version = (node: Hex) => log(node, 'VersionChanged', ['uint64'], [1n])
const data = (node: Hex, key: string, value: Hex) =>
  log(node, 'DataChanged', ['string'], [key], { indexedKey: key, indexedData: value })

const textRecord = (key: string, value: string, resolver: Address, inEffect = true) => ({
  id: `text ${stringToHex(key)}`,
  key: `text ${key}`,
  value,
  keyAsBytes: false,
  valueAsBytes: false,
  resolver,
  inEffect,
})

const child = (parent: Hex, label: string) =>
  keccak256(encodePacked(['bytes32', 'bytes32'], [parent, labelhash(label)]))

type Chain = {
  children: Record<Hex, string[]>
  subnames: Record<Hex, string[]>
  generation: Record<Hex, bigint>
  generations: Record<Hex, bigint>
  owners: Record<Hex, Address>
  resolvers: Record<Hex, Address>
  logs: Record<Address, ReturnType<typeof log>[]>
  values: Record<string, Hex>
  subnameResolver: Address
  unreadable: Address[]
}

let chain: Chain
const request = vi.fn(
  async ({
    params: [{ address: resolver, topics }],
  }: {
    params: [{ address: Address; topics: [Hex[], Hex[]] }]
  }) => {
    if (chain.unreadable.includes(resolver)) throw new Error('execution reverted')
    return (chain.logs[resolver] ?? []).filter(
      (l) => topics[0].includes(l.topics[0]) && topics[1].includes(l.topics[1] as Hex),
    )
  },
)
const client = { chain: { id: 1337 }, request } as unknown as ClientWithEns

beforeEach(() => {
  vi.clearAllMocks()
  mockGetLogs.mockImplementation((async (_: unknown, { args }: { args: { node: Hex[] } }) =>
    args.node.flatMap((node) =>
      (chain.children[node] ?? []).map((label) => ({ args: { node, label: labelhash(label) } })),
    )) as never)
  mockReadContract.mockImplementation((async (
    _: unknown,
    { functionName, args }: { functionName: string; args?: readonly unknown[] },
  ) => {
    const indexed = chain.subnames[args?.[0] as Hex] ?? []
    if (functionName === 'childrenLength') return BigInt(indexed.length)
    // The registrar's labels as viem decodes them: leading NUL bytes dropped.
    if (functionName === 'getChildren')
      return [indexed.map((label) => labelhash(label)), indexed.map((l) => l.replace(/^\0+/, ''))]
    if (functionName === 'generation') return chain.generation[args![0] as Hex] ?? 0n
    if (functionName === 'generationAt') return chain.generations[args![0] as Hex] ?? 0n
    if (functionName === 'owner') return chain.owners[args![0] as Hex] ?? zeroAddress
    if (functionName === 'resolver' && !args) return chain.subnameResolver
    if (functionName === 'resolver') return chain.resolvers[args![0] as Hex] ?? zeroAddress
    if (functionName === 'defaultResolver') return DEFAULT_RESOLVER
    if (functionName === 'wasDefaultResolver')
      return [DEFAULT_RESOLVER, OLD_RESOLVER].includes(args![0] as Address)
    return [args![1], chain.values[`${functionName} ${args!.join(' ')}`] ?? '0x']
  }) as never)
})

const root = namehash('alice.testing')
const tracked = namehash('mobile.alice.testing')
const shadow = child(root, 'shadow')
const cleared = child(root, 'cleared')
const gone = child(root, 'gone')

describe('getClaimChecks', () => {
  beforeEach(() => {
    chain = {
      children: { [root]: ['mobile', 'shadow', 'cleared', 'gone'] },
      subnames: { [root]: ['mobile'] },
      generation: {},
      generations: {},
      owners: { [root]: HOLDER, [tracked]: SUBNAME_REGISTRAR, [shadow]: HOLDER },
      resolvers: {
        [root]: DEFAULT_RESOLVER,
        [tracked]: DEFAULT_RESOLVER,
        [shadow]: CUSTOM_RESOLVER,
      },
      logs: {
        [DEFAULT_RESOLVER]: [
          text(root, 'old', 'gone after the version change'),
          version(root),
          text(root, 'simplex.contact', 'link'),
          address(root, 60n, HOLDER),
          address(root, 0n, '0x0102'),
          address(root, 0n, '0x'),
          address(tracked, 60n, zeroAddress),
          data(root, 'blob', '0x0b10b0'),
          text(tracked, 'simplex.contact', 'mobile link'),
          text(shadow, 'kept', 'value'),
          text(cleared, 'kept', 'value'),
        ],
        [CUSTOM_RESOLVER]: [text(shadow, 'url', 'https://example.com')],
      },
      values: {},
      subnameResolver: DEFAULT_RESOLVER,
      unreadable: [],
    }
  })

  it('lists every node under the name with the records it currently holds', async () => {
    const { nodes, complete } = await getClaimChecks(client, 'alice.testing')
    expect(complete).toBe(true)
    expect(nodes).toEqual([
      {
        node: root,
        status: 'tracked',
        name: 'alice.testing',
        owner: HOLDER,
        recordsUnreadable: false,
        records: [
          textRecord('simplex.contact', 'link', DEFAULT_RESOLVER),
          {
            id: 'address 60',
            key: 'address 60',
            value: HOLDER,
            resolver: DEFAULT_RESOLVER,
            inEffect: true,
          },
          {
            id: `data ${stringToHex('blob')}`,
            key: 'data blob',
            value: `keccak256 ${keccak256('0x0b10b0')}`,
            keyAsBytes: false,
            resolver: DEFAULT_RESOLVER,
            inEffect: true,
          },
        ],
      },
      {
        node: tracked,
        status: 'tracked',
        name: 'mobile.alice.testing',
        owner: SUBNAME_REGISTRAR,
        recordsUnreadable: false,
        records: [
          {
            id: 'address 60',
            key: 'address 60',
            value: zeroAddress,
            resolver: DEFAULT_RESOLVER,
            inEffect: true,
          },
          textRecord('simplex.contact', 'mobile link', DEFAULT_RESOLVER),
        ],
      },
      {
        node: shadow,
        status: 'untracked',
        owner: HOLDER,
        customResolver: CUSTOM_RESOLVER,
        recordsUnreadable: false,
        records: [
          textRecord('url', 'https://example.com', CUSTOM_RESOLVER),
          textRecord('kept', 'value', DEFAULT_RESOLVER, false),
        ],
      },
      {
        node: cleared,
        status: 'ownerless',
        owner: zeroAddress,
        recordsUnreadable: false,
        records: [textRecord('kept', 'value', DEFAULT_RESOLVER, false)],
      },
    ])
  })

  it('decodes every record type and drops the cleared ones', async () => {
    const x = `0x${'11'.repeat(32)}` as const
    const y = `0x${'22'.repeat(32)}` as const
    const zero = `0x${'00'.repeat(32)}` as const
    chain.values = { [`ABI ${root} 1`]: '0xab1' }
    chain.logs[DEFAULT_RESOLVER] = [
      log(root, 'ContenthashChanged', ['bytes'], ['0xe301']),
      log(root, 'ABIChanged', [], [], { contentType: 1n }),
      log(root, 'PubkeyChanged', ['bytes32', 'bytes32'], [x, y]),
      log(root, 'NameChanged', ['string'], ['alice']),
      log(root, 'InterfaceChanged', ['address'], [HOLDER], { interfaceID: '0x01ffc9a7' }),
      log(root, 'DNSRecordChanged', ['bytes', 'uint16', 'bytes'], ['0x01', 1, '0x02']),
      log(root, 'DNSZonehashChanged', ['bytes', 'bytes'], ['0x', '0x03']),
      log(root, 'AddrChanged', ['address'], [HOLDER]),
      log(tracked, 'ContenthashChanged', ['bytes'], ['0xe301']),
      log(tracked, 'ContenthashChanged', ['bytes'], ['0x']),
      log(tracked, 'ABIChanged', [], [], { contentType: 2n }),
      log(tracked, 'PubkeyChanged', ['bytes32', 'bytes32'], [x, y]),
      log(tracked, 'PubkeyChanged', ['bytes32', 'bytes32'], [zero, zero]),
      log(tracked, 'NameChanged', ['string'], ['mobile']),
      log(tracked, 'NameChanged', ['string'], ['']),
      log(tracked, 'InterfaceChanged', ['address'], [HOLDER], { interfaceID: '0x01ffc9a7' }),
      log(tracked, 'InterfaceChanged', ['address'], [zeroAddress], { interfaceID: '0x01ffc9a7' }),
      log(tracked, 'DNSRecordChanged', ['bytes', 'uint16', 'bytes'], ['0x01', 1, '0x02']),
      log(tracked, 'DNSRecordDeleted', ['bytes', 'uint16'], ['0x01', 1]),
      log(tracked, 'DNSZonehashChanged', ['bytes', 'bytes'], ['0x', '0x03']),
      log(tracked, 'DNSZonehashChanged', ['bytes', 'bytes'], ['0x03', '0x']),
      data(tracked, 'blob', '0x0b10b0'),
      data(tracked, 'blob', '0x'),
    ]
    const { nodes } = await getClaimChecks(client, 'alice.testing')
    expect(nodes[0].records.map(({ key, value }) => `${key}: ${value}`)).toEqual([
      'contenthash: 0xe301',
      'ABI 1: 0xab1',
      `pubkey: ${x} ${y}`,
      'name: alice',
      `interface 0x01ffc9a7: ${HOLDER}`,
      'DNS 0x01 1: 0x02',
      'DNS zonehash: 0x03',
    ])
    expect(nodes[1].records).toEqual([])
  })

  it('keeps keys apart that decode to the same text, and shows them as bytes', async () => {
    chain.logs[DEFAULT_RESOLVER] = [
      text(root, 'simplex.contact', 'evil'),
      text(root, '\0simplex.contact', 'decoy'),
      text(root, 'url', 'link'),
      text(root, '\0url', ''),
      text(root, 'literal', '0x'),
      log(root, 'TextChanged', ['bytes', 'string'], ['0xff61', 'first'], { indexedKey: 'x' }),
      log(root, 'TextChanged', ['bytes', 'string'], ['0xfe61', 'second'], { indexedKey: 'y' }),
      text(root, 'hidden', 'https://example.com\u{FE00}\u{E0100}\u{3164}'),
      log(root, 'TextChanged', ['string', 'bytes'], ['0x6b00', '0x00'], { indexedKey: '0x6b00' }),
      log(root, 'TextChanged', ['bytes', 'string'], ['0x6b00', '0x00'], { indexedKey: 'z' }),
      text(root, ' simplex.contact', 'leading space'),
      text(root, 'gap', 'a\u{3000}b'),
      text(root, 'blank', '\u{2800}x'),
      text(root, 'spaced', 'one two'),
      text(root, 'caf\u{E9}', 'composed'),
      text(root, 'cafe\u{301}', 'decomposed'),
      text(root, 'simplex.contact\u{1D159}', 'blank glyph'),
      text(root, 'rtl', '\u{5D0} 12'),
      text(root, '\u{FEFF}simplex.contact', 'byte order mark'),
      text(root, 'bom', '\u{FEFF}hello'),
    ]
    const { nodes } = await getClaimChecks(client, 'alice.testing')
    expect(
      nodes[0].records.map(({ key, value, keyAsBytes, valueAsBytes }) => [
        key,
        value,
        keyAsBytes,
        valueAsBytes,
      ]),
    ).toEqual([
      ['text simplex.contact', 'evil', false, false],
      [`text ${stringToHex('\0simplex.contact')}`, 'decoy', true, false],
      ['text url', 'link', false, false],
      ['text literal', '0x', false, false],
      ['text 0xff61', 'first', true, false],
      ['text 0xfe61', 'second', true, false],
      ['text hidden', stringToHex('https://example.com\u{FE00}\u{E0100}\u{3164}'), false, true],
      ['text 0x6b00', '0x00', false, true],
      ['text 0x6b00', '0x00', true, false],
      [`text ${stringToHex(' simplex.contact')}`, 'leading space', true, false],
      ['text gap', stringToHex('a\u{3000}b'), false, true],
      ['text blank', stringToHex('\u{2800}x'), false, true],
      ['text spaced', 'one two', false, false],
      [`text ${stringToHex('caf\u{E9}')}`, 'composed', true, false],
      [`text ${stringToHex('cafe\u{301}')}`, 'decomposed', true, false],
      [`text ${stringToHex('simplex.contact\u{1D159}')}`, 'blank glyph', true, false],
      ['text rtl', stringToHex('\u{5D0} 12'), false, true],
      [`text ${stringToHex('\u{FEFF}simplex.contact')}`, 'byte order mark', true, false],
      ['text bom', stringToHex('\u{FEFF}hello'), false, true],
    ])
  })

  it('reads only record events from a resolver', async () => {
    await getClaimChecks(client, 'alice.testing')
    const [[{ params }]] = request.mock.calls
    expect(params[0].topics[0]).toHaveLength(12)
    expect(params[0].topics[0]).not.toContain(
      log(root, 'AddrChanged', ['address'], [HOLDER]).topics[0],
    )
  })

  it('names only live subnames the subname registrar owns under a tracked node', async () => {
    const inner = namehash('inner.mobile.alice.testing')
    const stale = child(root, 'stale')
    const deep = child(shadow, 'deep')
    const dead = child(root, 'dead')
    chain.children[root].push('stale', 'dead')
    chain.children[tracked] = ['inner']
    chain.children[shadow] = ['deep']
    chain.subnames[root].push('dead')
    chain.subnames[tracked] = ['inner']
    chain.generations[dead] = 7n
    for (const node of [inner, stale, deep, dead]) chain.owners[node] = SUBNAME_REGISTRAR
    const { nodes } = await getClaimChecks(client, 'alice.testing')
    const statusAndName = (node: Hex) => {
      const found = nodes.find((n) => n.node === node)
      return [found?.status, found?.name]
    }
    expect(statusAndName(inner)).toEqual(['tracked', 'inner.mobile.alice.testing'])
    for (const node of [stale, deep, dead])
      expect(statusAndName(node)).toEqual(['registrar', undefined])
    expect(mockGetLogs).toHaveBeenCalledTimes(3)
  })

  it('names only subnames of the current generation of a re-registered name', async () => {
    const old = child(root, 'old')
    chain.generation[root] = 1n
    chain.generations[tracked] = 1n
    chain.children[root].push('old')
    chain.subnames[root].push('old')
    chain.owners[old] = SUBNAME_REGISTRAR
    const { nodes } = await getClaimChecks(client, 'alice.testing')
    expect(nodes.find((n) => n.node === tracked)?.name).toBe('mobile.alice.testing')
    expect(nodes.find((n) => n.node === old)?.status).toBe('registrar')
  })

  it("names a subname's children by the subname's current generation", async () => {
    const inner = child(tracked, 'inner')
    const old = child(tracked, 'old')
    chain.children[tracked] = ['inner', 'old']
    chain.subnames[tracked] = ['inner', 'old']
    chain.generation[tracked] = 2n
    chain.generations[inner] = 2n
    chain.generations[old] = 1n
    for (const node of [inner, old]) chain.owners[node] = SUBNAME_REGISTRAR
    const { nodes } = await getClaimChecks(client, 'alice.testing')
    expect(nodes.find((n) => n.node === inner)?.name).toBe('inner.mobile.alice.testing')
    expect(nodes.find((n) => n.node === old)?.status).toBe('registrar')
  })

  it('names live subnames while the name itself has no registry owner', async () => {
    chain.owners[root] = zeroAddress
    const { nodes } = await getClaimChecks(client, 'alice.testing')
    expect([nodes[1].node, nodes[1].status, nodes[1].name]).toEqual([
      tracked,
      'tracked',
      'mobile.alice.testing',
    ])
  })

  it('does not name a subname whose label the app cannot open', async () => {
    const labels = [
      '\0nul',
      'a.b',
      ' pay',
      'p ay',
      'caf\u{E9}',
      '\u{5D0}1',
      'sup\u{1D159}port',
      'Support',
      'help!',
      'a_b',
      'xn--a',
      '-a',
    ]
    chain.children[root].push(...labels)
    chain.subnames[root].push(...labels)
    for (const label of labels) chain.owners[child(root, label)] = SUBNAME_REGISTRAR
    const { nodes } = await getClaimChecks(client, 'alice.testing')
    for (const label of labels) {
      const node = nodes.find((n) => n.node === child(root, label))
      expect([node?.status, node?.name]).toEqual(['registrar', undefined])
    }
  })

  it('does not name an indexed subname whose registry node another owner took', async () => {
    chain.owners[tracked] = HOLDER
    const { nodes } = await getClaimChecks(client, 'alice.testing')
    expect([nodes[1].node, nodes[1].status, nodes[1].name]).toEqual([
      tracked,
      'untracked',
      undefined,
    ])
  })

  it('reports the walk incomplete past 100 nodes', async () => {
    chain.children[root] = Array.from({ length: 100 }, (_, i) => `sub${i}`)
    chain.subnames[root] = chain.children[root]
    const { complete } = await getClaimChecks(client, 'alice.testing')
    expect(complete).toBe(false)
    for (const functionName of ['getChildren', 'generationAt'])
      expect(mockReadContract).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ functionName }),
      )
    chain.children[root] = chain.children[root].slice(1)
    expect((await getClaimChecks(client, 'alice.testing')).complete).toBe(true)
  })

  it('changes the digest when a record value changes', async () => {
    const before = await getClaimChecks(client, 'alice.testing')
    chain.logs[DEFAULT_RESOLVER].push(data(root, 'blob', '0x0bad'))
    expect((await getClaimChecks(client, 'alice.testing')).digest).not.toBe(before.digest)
  })

  it('lists a cleared node that holds records only on a default resolver', async () => {
    chain.logs[DEFAULT_RESOLVER].push(text(gone, 'new', 'value'))
    const { nodes } = await getClaimChecks(client, 'alice.testing')
    expect(nodes.at(-1)).toEqual({
      node: gone,
      status: 'ownerless',
      owner: zeroAddress,
      recordsUnreadable: false,
      records: [textRecord('new', 'value', DEFAULT_RESOLVER, false)],
    })
  })

  it("reads the subname registrar's resolver as a default resolver", async () => {
    chain.subnameResolver = OLD_RESOLVER
    chain.logs[OLD_RESOLVER] = [text(gone, 'mobile', 'link')]
    const { nodes } = await getClaimChecks(client, 'alice.testing')
    expect(nodes.at(-1)).toMatchObject({
      node: gone,
      records: [textRecord('mobile', 'link', OLD_RESOLVER, false)],
    })
  })

  it('lists an ABI on a holder-chosen resolver without reading it', async () => {
    chain.logs[CUSTOM_RESOLVER] = [log(shadow, 'ABIChanged', [], [], { contentType: 1n })]
    const { nodes } = await getClaimChecks(client, 'alice.testing')
    expect(nodes[2].records[0]).toEqual({
      id: 'ABI 1',
      key: 'ABI 1',
      value: '',
      valueUnread: true,
      resolver: CUSTOM_RESOLVER,
      inEffect: true,
    })
    expect(mockReadContract).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ functionName: 'ABI' }),
    )
  })

  it('flags a holder-chosen resolver it cannot read and still reads the rest', async () => {
    chain.unreadable = [CUSTOM_RESOLVER]
    const { nodes, complete } = await getClaimChecks(client, 'alice.testing')
    expect(complete).toBe(true)
    expect(nodes[2]).toMatchObject({
      node: shadow,
      customResolver: CUSTOM_RESOLVER,
      recordsUnreadable: true,
      records: [textRecord('kept', 'value', DEFAULT_RESOLVER, false)],
    })
  })

  it('treats a past default resolver as a default resolver', async () => {
    chain.resolvers[shadow] = OLD_RESOLVER
    chain.logs[OLD_RESOLVER] = [text(shadow, 'url', 'link')]
    const { nodes } = await getClaimChecks(client, 'alice.testing')
    expect(nodes[2]).toMatchObject({
      node: shadow,
      customResolver: undefined,
      records: [
        textRecord('url', 'link', OLD_RESOLVER),
        textRecord('kept', 'value', DEFAULT_RESOLVER, false),
      ],
    })
    chain.unreadable = [OLD_RESOLVER]
    await expect(getClaimChecks(client, 'alice.testing')).rejects.toThrow('execution reverted')
  })

  it('fails when a default resolver cannot be read', async () => {
    chain.unreadable = [DEFAULT_RESOLVER]
    await expect(getClaimChecks(client, 'alice.testing')).rejects.toThrow('execution reverted')
  })
})
