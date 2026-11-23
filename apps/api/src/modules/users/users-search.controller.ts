import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SiteModule } from '../system/site-module.decorator';
import { SearchUsersDto } from './dto/search-users.dto';
import { UsersSearchService } from './users-search.service';

/// Публичный поиск игроков. Маршрут `users/search` — один сегмент, а
/// параметрические маршруты `users/:username/...` имеют два и больше, поэтому
/// конфликта нет; контроллер зарегистрирован первым в модуле.
@SiteModule('profiles')
@Controller('users')
export class UsersSearchController {
  constructor(private readonly search: UsersSearchService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('search')
  find(@Query() query: SearchUsersDto) {
    return this.search.search(query.q, query.page, query.limit);
  }
}
