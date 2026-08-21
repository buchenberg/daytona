import { DockerRegistryService } from './docker-registry.service'
import { RegistryType } from '../enums/registry-type.enum'

describe('DockerRegistryService.isSnapshotRegistryImageRef', () => {
  // Shared (organizationId IS NULL) built-snapshot rows seen in prod: the INTERNAL registry and its
  // BACKUP mirrors, each with a project. TRANSIENT rows are intentionally NOT part of the deny set —
  // the local image-push flow legitimately references the transient project (e.g. sbox-transient),
  // which shares a host with the internal project (sbox). The Docker Hub passthrough (stored as an
  // INTERNAL row with an empty project) must not cause public pulls to be blocked.
  const denyRows = [
    { url: 'cr.app.daytona.io', project: 'sbox', registryType: RegistryType.INTERNAL },
    { url: 'harbor.internal.daytona.app', project: 'bbox', registryType: RegistryType.INTERNAL },
    { url: 'cr-snapshot.app.daytona.io', project: 'snapshots', registryType: RegistryType.INTERNAL },
    { url: 'cr.eu.app.daytona.io', project: 'sbox', registryType: RegistryType.INTERNAL }, // cross-region
    { url: 'registry:5000', project: 'sbox', registryType: RegistryType.INTERNAL }, // dev host:port
    { url: 'cr2.app.daytona.io', project: 'sbox', registryType: RegistryType.BACKUP }, // backup mirror
    { url: 'docker.io', project: '', registryType: RegistryType.INTERNAL }, // Docker Hub passthrough
  ]

  function createService(rows: Array<{ url: string; project: string; registryType: RegistryType }> = denyRows) {
    const repository = {
      find: jest.fn().mockResolvedValue(rows),
    }
    const service = new DockerRegistryService(repository as never, {} as never, {} as never, {} as never)
    return { service, repository }
  }

  const hex = 'a'.repeat(64)
  const internalRef = `cr.app.daytona.io/sbox/daytona-${hex}:daytona`

  describe('blocks built-snapshot (internal/backup) registry references', () => {
    const blocked: Array<[string, string]> = [
      ['canonical internal ref', internalRef],
      ['explicit :443 port on internal host', `cr.app.daytona.io:443/sbox/daytona-${hex}:daytona`],
      ['explicit :5000 port on internal host', `cr.app.daytona.io:5000/sbox/x:tag`],
      ['uppercase host and project', `CR.APP.DAYTONA.IO/SBOX/daytona-${hex}:daytona`],
      ['@sha256 digest form', `cr.app.daytona.io/sbox/x@sha256:${hex}`],
      ['extra /./ segment before project', `cr.app.daytona.io/./sbox/x:tag`],
      ['duplicate slash before project', `cr.app.daytona.io//sbox/x:tag`],
      ['bbox project on second internal host', `harbor.internal.daytona.app/bbox/x:tag`],
      ['snapshots project on third internal host', `cr-snapshot.app.daytona.io/snapshots/x:tag`],
      ['cross-region internal host', `cr.eu.app.daytona.io/sbox/daytona-${hex}:daytona`],
      ['backup mirror host', `cr2.app.daytona.io/sbox/x:tag`],
      ['dev host:port internal', `registry:5000/sbox/x:tag`],
    ]

    it.each(blocked)('blocks %s', async (_label, imageName) => {
      const { service } = createService()
      await expect(service.isSnapshotRegistryImageRef(imageName)).resolves.toBe(true)
    })
  })

  describe('mirrors the pull resolver port behavior', () => {
    // A stored URL WITH a port matches only that exact port (the resolver stores registry:5000 and
    // would not pull registry:6000); a stored URL WITHOUT a port matches any port.
    it('blocks the exact port of a port-carrying internal host', async () => {
      const { service } = createService()
      await expect(service.isSnapshotRegistryImageRef('registry:5000/sbox/x:tag')).resolves.toBe(true)
    })
    it('allows a DIFFERENT port on a port-carrying internal host (resolver would not pull)', async () => {
      const { service } = createService()
      await expect(service.isSnapshotRegistryImageRef('registry:6000/sbox/app:tag')).resolves.toBe(false)
    })
    it('blocks any port when the internal host is stored without a port (attack variant)', async () => {
      const { service } = createService()
      await expect(service.isSnapshotRegistryImageRef('cr.app.daytona.io:443/sbox/x:tag')).resolves.toBe(true)
      await expect(service.isSnapshotRegistryImageRef('cr.app.daytona.io:9999/sbox/x:tag')).resolves.toBe(true)
    })
  })

  describe('allows the transient project (local image-push flow) on the shared host', () => {
    // The single most important regression guard: users push to the transient project on the SAME
    // host as the internal project and create a snapshot with that imageName. It must stay allowed.
    const allowedTransient: Array<[string, string]> = [
      ['transient project on shared internal host', 'cr.app.daytona.io/sbox-transient/myimg:0.1'],
      ['transient project with :443 port', 'cr.app.daytona.io:443/sbox-transient/myimg:0.1'],
      ['dedicated transient host', 'cr-transient.app.daytona.io/transient/x:tag'],
      ['transient host with daytona project', 'harbor-transient.internal.daytona.app/daytona/x:tag'],
    ]

    it.each(allowedTransient)('allows %s', async (_label, imageName) => {
      const { service } = createService()
      await expect(service.isSnapshotRegistryImageRef(imageName)).resolves.toBe(false)
    })
  })

  describe('allows legitimate public and BYO references', () => {
    const allowed: Array<[string, string]> = [
      ['public ubuntu', 'ubuntu:22.04'],
      ['public node', 'node:18'],
      ['explicit docker.io', 'docker.io/library/python:3.12'],
      ['registry-1.docker.io', 'registry-1.docker.io/library/nginx:1.27'],
      ['public ecr', 'public.ecr.aws/foo/bar:1.0'],
      ['ghcr', 'ghcr.io/x/y:tag'],
      ['BYO organization host', 'myregistry.com/team/app:1.0'],
      ['bare docker-hub-style path (no dotted host)', `sbox/daytona-${hex}:daytona`],
      ['lookalike host does not match host equality', 'cr.app.daytona.io-evil.com/sbox/x:tag'],
    ]

    it.each(allowed)('allows %s', async (_label, imageName) => {
      const { service } = createService()
      await expect(service.isSnapshotRegistryImageRef(imageName)).resolves.toBe(false)
    })
  })

  it('returns false for empty imageName without querying', async () => {
    const { service, repository } = createService()
    await expect(service.isSnapshotRegistryImageRef('')).resolves.toBe(false)
    expect(repository.find).not.toHaveBeenCalled()
  })

  it('scopes the candidate query to shared (org-null) internal and backup rows only', async () => {
    const { service, repository } = createService()
    await service.isSnapshotRegistryImageRef(internalRef)
    expect(repository.find).toHaveBeenCalledTimes(1)
    const where = repository.find.mock.calls[0][0].where
    expect(where).toHaveLength(2)
    const types = where.map((w: { registryType: RegistryType }) => w.registryType).sort()
    expect(types).toEqual([RegistryType.BACKUP, RegistryType.INTERNAL])
    // transient is deliberately excluded; every branch pins organizationId IS NULL
    for (const w of where) {
      expect(w.registryType).not.toBe(RegistryType.TRANSIENT)
      expect(w.organizationId).toBeDefined()
    }
  })
})
