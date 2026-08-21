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
