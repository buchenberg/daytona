/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm'

@Entity()
@Unique(['domain'])
export class EmailDomainWhitelist {
  @PrimaryGeneratedColumn('increment')
  id: number

  @Column()
  domain: string

  @CreateDateColumn({
    type: 'timestamp with time zone',
  })
  createdAt: Date
}
