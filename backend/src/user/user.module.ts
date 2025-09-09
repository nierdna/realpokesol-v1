import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
