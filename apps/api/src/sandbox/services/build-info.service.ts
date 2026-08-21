import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BuildInfo } from '../entities/build-info.entity'
import { CreateBuildInfoDto } from '../dto/create-build-info.dto'
import { RedisLockProvider } from '../common/redis-lock.provider'

@Injectable()
export class BuildInfoService {
  constructor(
    @InjectRepository(BuildInfo)
    private readonly buildInfoRepository: Repository<BuildInfo>,
    private readonly redisLockProvider: RedisLockProvider,
  ) {}

  async getOrCreate(snapshotRef: string, buildInfo: CreateBuildInfoDto): Promise<BuildInfo> {
    const insertResult = await this.buildInfoRepository
      .createQueryBuilder()
      .insert()
      .values({
        snapshotRef,
        dockerfileContent: buildInfo.dockerfileContent,
        contextHashes: buildInfo.contextHashes,
      })
      .orIgnore()
      .returning(['snapshotRef'])
      .execute()

    const inserted = insertResult.raw.length > 0

    const buildInfoEntity = await this.buildInfoRepository.findOneOrFail({
      where: { snapshotRef },
    })

    // Update lastUsed once per minute at most to avoid hammering the DB
    if (!inserted && (await this.redisLockProvider.lock(`build-info:${snapshotRef}:update`, 60))) {
      await this.buildInfoRepository.update(snapshotRef, { lastUsedAt: new Date() })
    }

    return buildInfoEntity
  }
}
