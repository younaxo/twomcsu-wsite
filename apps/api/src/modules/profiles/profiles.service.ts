import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SocialPlatform } from '@prisma/client';
import { StorageService } from '../files/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMediaRequestDto } from './dto/create-media-request.dto';
import { resolveUserIdByHandle } from './handle';
import { CreateProfileReportDto } from './dto/create-profile-report.dto';
import { SelectDecorationDto } from './dto/select-decoration.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpsertSocialLinkDto } from './dto/upsert-social-link.dto';
import { connectedProfileUrl } from '../auth/connected-providers';
import { formatDiscriminator } from '../users/public-tag';

const OWN_PROFILE_SELECT = {
  id: true,
  shortId: true,
  tag: true,
  discriminator: true,
  username: true,
  email: true,
  avatar: true,
  banner: true,
  bannerPreset: true,
  statusText: true,
  bio: true,
  country: true,
  city: true,
  gender: true,
  birthDate: true,
  showBirthDate: true,
  profileVisibility: true,
  friendRequestPolicy: true,
  directMessagePolicy: true,
  hideEmail: true,
  hideCountry: true,
  hideCity: true,
  hideBirthDate: true,
  hideGender: true,
  hideStatistics: true,
  hideSocials: true,
  commentPolicy: true,
  commentsEnabled: true,
  notifyOnComment: true,
  notifyOnMention: true,
  notifyOnReply: true,
  notifyOnFriendRequest: true,
  notifyOnGift: true,
  notifyOnOrder: true,
  position: true,
  selectedDecoration: true,
  displayBadge: true,
  socialLinks: true,
  minecraftAccount: { select: { name: true } },
  createdAt: true,
} satisfies Prisma.UserSelect;

/// Discord, Telegram, VK и Steam — только реальные привязки (Connected
/// Accounts, ADR-0095), а не введённый текст: в соцсетях их нет, ввести
/// вручную нельзя.
export const CONNECTED_PLATFORMS = new Set<string>([
  'DISCORD',
  'TELEGRAM',
  'VK',
  'STEAM',
]);

/// Проверка ссылок соцсетей (B5): сайт — только https; GitHub — ник или
/// https://github.com/… (нормализуется в ссылку).
export function normalizeSocialValue(
  platform: string,
  raw: string,
): string | null {
  const value = raw.trim();
  if (!value) return null;
  const https = (input: string, hosts?: string[]): string | null => {
    try {
      const url = new URL(input);
      if (url.protocol !== 'https:') return null;
      if (hosts && !hosts.includes(url.hostname.toLowerCase())) return null;
      return url.toString();
    } catch {
      return null;
    }
  };
  if (platform === 'WEBSITE') return https(value);
  if (platform === 'GITHUB') {
    if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value)) {
      return `https://github.com/${value}`;
    }
    return https(value, ['github.com', 'www.github.com']);
  }
  return value;
}

type OwnProfile = Prisma.UserGetPayload<{ select: typeof OWN_PROFILE_SELECT }>;
type OwnProfileView = Omit<OwnProfile, 'discriminator'> & {
  discriminator: string;
};

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /// Медиа профиля наружу — только готовыми URL (ADR-0088): в БД лежат ключи
  /// хранилища, браузер не должен их достраивать.
  private withMedia<
    T extends {
      avatar: string | null;
      banner: string | null;
      selectedDecoration: { imageUrl: string } | null;
    },
  >(user: T): T {
    return {
      ...user,
      avatar: this.storage.publicUrl(user.avatar),
      banner: this.storage.publicUrl(user.banner),
      selectedDecoration: user.selectedDecoration
        ? {
            ...user.selectedDecoration,
            imageUrl:
              this.storage.publicUrl(user.selectedDecoration.imageUrl) ?? '',
          }
        : null,
    };
  }

  /// Свой профиль для клиента: готовые URL и discriminator четырьмя цифрами.
  private ownView(user: OwnProfile): OwnProfileView {
    return {
      ...this.withMedia(user),
      discriminator: formatDiscriminator(user.discriminator),
    };
  }

  async getOwnProfile(userId: string): Promise<OwnProfileView> {
    return this.ownView(
      await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: OWN_PROFILE_SELECT,
      }),
    );
  }

  async updateOwnProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<OwnProfileView> {
    const { birthDate, ...rest } = dto;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...rest,
        // null — очистить дату (new Date(null) дало бы 1970-01-01).
        ...(birthDate !== undefined
          ? { birthDate: birthDate === null ? null : new Date(birthDate) }
          : {}),
      },
      select: OWN_PROFILE_SELECT,
    });
    return this.ownView(updated);
  }

  /// Фильтрует профиль по приватности для чужого просмотра. FRIENDS_ONLY
  /// трактуется как недоступно посторонним до появления системы друзей
  /// (PHASE 09) — безопасный дефолт (меньше раскрытия, не больше).
  async getPublicProfile(
    username: string,
    viewerId: string | null,
  ): Promise<OwnProfile | Record<string, unknown>> {
    const id = await resolveUserIdByHandle(this.prisma, username);
    const user = id
      ? await this.prisma.user.findUnique({
          where: { id },
          select: OWN_PROFILE_SELECT,
        })
      : null;
    if (!user) {
      throw new NotFoundException('Профиль не найден');
    }

    const isOwner = viewerId !== null && viewerId === user.id;
    if (!(await this.canView(user, viewerId))) {
      throw new NotFoundException('Профиль не найден');
    }

    const resolved = this.withMedia(user);
    const base = isOwner ? { ...resolved } : this.applyPrivacy(resolved);
    const showSocials = isOwner || !user.hideSocials;
    return {
      ...base,
      minecraftName: user.minecraftAccount?.name ?? null,
      stats: await this.profileStats(user.id, viewerId),
      // Привязанные Discord/Telegram — провайдер и имя, без внешних ID.
      connectedAccounts: showSocials
        ? await this.connectedAccounts(user.id)
        : undefined,
      socialLinks: showSocials
        ? user.socialLinks.filter(
            (link) => !CONNECTED_PLATFORMS.has(link.platform),
          )
        : undefined,
    };
  }

  private async connectedAccounts(userId: string) {
    // Скрытые владельцем провайдеры не уходят в ответ вовсе (не только в UI).
    const accounts = await this.prisma.userExternalAccount.findMany({
      where: { userId, isPublic: true },
      select: {
        provider: true,
        providerUserId: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
      orderBy: { linkedAt: 'asc' },
    });
    // Внешний id в ответ не попадает (кроме того, что уже есть в публичной
    // ссылке провайдера, например Steam ID в адресе профиля).
    return accounts.map((account) => ({
      provider: account.provider,
      name: account.username ?? account.displayName ?? null,
      avatarUrl: account.avatarUrl,
      // Только из реальной привязки; нет публичной страницы — null.
      url: connectedProfileUrl(account.provider, account),
    }));
  }

  /// Просмотры (уникальные зрители, без собственных) и реакции профиля.
  private async profileStats(profileId: string, viewerId: string | null) {
    const [views, likes, dislikes, mine] = await Promise.all([
      this.prisma.profileView.count({ where: { profileId } }),
      this.prisma.profileReaction.count({
        where: { profileId, type: 'LIKE' },
      }),
      this.prisma.profileReaction.count({
        where: { profileId, type: 'DISLIKE' },
      }),
      viewerId && viewerId !== profileId
        ? this.prisma.profileReaction.findUnique({
            where: { profileId_userId: { profileId, userId: viewerId } },
            select: { type: true },
          })
        : Promise.resolve(null),
    ]);
    return { views, likes, dislikes, myReaction: mine?.type ?? null };
  }

  /// Видимый зрителю профиль по handle или 404 (одинаково для «нет» и
  /// «скрыт»).
  private async visibleProfile(handle: string, viewerId: string | null) {
    const id = await resolveUserIdByHandle(this.prisma, handle);
    const user = id
      ? await this.prisma.user.findUnique({
          where: { id },
          select: { id: true, profileVisibility: true },
        })
      : null;
    if (!user || !(await this.canView(user, viewerId))) {
      throw new NotFoundException('Профиль не найден');
    }
    return user;
  }

  /// Просмотр профиля (B5): только вошедшие, свой — не считается; один
  /// зритель — один просмотр (повтор обновляет время).
  async recordView(handle: string, viewerId: string) {
    const profile = await this.visibleProfile(handle, viewerId);
    if (profile.id !== viewerId) {
      await this.prisma.profileView.upsert({
        where: {
          profileId_viewerId: { profileId: profile.id, viewerId },
        },
        create: { profileId: profile.id, viewerId },
        update: { viewedAt: new Date() },
      });
    }
    return this.profileStats(profile.id, viewerId);
  }

  /// Лайк/дизлайк профиля (B5): одна реакция на пару, себе — нельзя;
  /// `null` — снять реакцию.
  async react(handle: string, userId: string, type: 'LIKE' | 'DISLIKE' | null) {
    const profile = await this.visibleProfile(handle, userId);
    if (profile.id === userId) {
      throw new ForbiddenException('Нельзя оценить свой профиль');
    }
    if (type === null) {
      await this.prisma.profileReaction.deleteMany({
        where: { profileId: profile.id, userId },
      });
    } else {
      await this.prisma.profileReaction.upsert({
        where: { profileId_userId: { profileId: profile.id, userId } },
        create: { profileId: profile.id, userId, type },
        update: { type },
      });
    }
    return this.profileStats(profile.id, userId);
  }

  /// Видимость профиля для зрителя: владелец — всегда; блокировка в любую
  /// сторону — скрыт; NOBODY — скрыт; FRIENDS_ONLY — только принятым друзьям
  /// (раньше скрывался и от друзей); EVERYONE — всем.
  private async canView(
    user: { id: string; profileVisibility: string },
    viewerId: string | null,
  ): Promise<boolean> {
    if (viewerId === user.id) return true;
    if (user.profileVisibility === 'NOBODY') return false;
    if (!viewerId) return user.profileVisibility === 'EVERYONE';
    const relations = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: viewerId, addresseeId: user.id },
          { requesterId: user.id, addresseeId: viewerId },
        ],
      },
      select: { status: true },
    });
    if (relations.some((item) => item.status === 'BLOCKED')) return false;
    if (user.profileVisibility === 'FRIENDS_ONLY') {
      return relations.some((item) => item.status === 'ACCEPTED');
    }
    return true;
  }

  /// Карточка превью (ADR-0073). Те же правила видимости, что у публичного
  /// профиля; для скрытого профиля — только ник и признак `hidden`. Нет данных
  /// — `null` (никаких выдуманных нулей). Статистика — только если игрок её не
  /// скрыл и она реально есть.
  async getProfileSummary(username: string, viewerId: string | null) {
    const handleId = await resolveUserIdByHandle(this.prisma, username);
    const user = await this.prisma.user.findFirst({
      where: { id: handleId ?? '__none__' },
      select: {
        id: true,
        shortId: true,
        username: true,
        tag: true,
        discriminator: true,
        avatar: true,
        banner: true,
        statusText: true,
        createdAt: true,
        accountType: true,
        selectedDecoration: {
          select: { slug: true, name: true, imageUrl: true, isActive: true },
        },
        badges: {
          where: {
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { type: true },
          orderBy: [{ order: 'asc' }, { grantedAt: 'asc' }],
        },
        mediaBadges: {
          where: { isApproved: true },
          select: { mediaGroup: true },
          orderBy: { approvedAt: 'asc' },
        },
        isBanned: true,
        profileVisibility: true,
        hideStatistics: true,
        lastActivityAt: true,
        isOnlineInGame: true,
        currentServer: true,
        position: { select: { displayName: true, color: true } },
        roles: {
          select: {
            role: {
              select: {
                slug: true,
                displayName: true,
                priority: true,
                color: true,
              },
            },
          },
        },
        statistics: {
          select: {
            playTime: true,
            kills: true,
            deaths: true,
            killDeathRatio: true,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Профиль не найден');
    }
    const isOwner = viewerId !== null && viewerId === user.id;
    if (!(await this.canView(user, viewerId))) {
      return { username: user.username, hidden: true as const };
    }
    const [friendsCount, achievementsCompleted] = await Promise.all([
      this.prisma.friendship.count({
        where: {
          status: 'ACCEPTED',
          OR: [{ requesterId: user.id }, { addresseeId: user.id }],
        },
      }),
      this.prisma.userAchievement.count({
        where: { userId: user.id, isCompleted: true },
      }),
    ]);
    const showStats = isOwner || !user.hideStatistics;
    return {
      username: user.username,
      hidden: false as const,
      shortId: user.shortId,
      tag: user.tag,
      discriminator: formatDiscriminator(user.discriminator),
      avatar: this.storage.publicUrl(user.avatar),
      banner: this.storage.publicUrl(user.banner),
      // Тот же статус, что в публичном профиле (один источник — User.statusText).
      statusText: user.statusText ?? null,
      decoration:
        user.selectedDecoration?.isActive && user.selectedDecoration.imageUrl
          ? {
              slug: user.selectedDecoration.slug,
              name: user.selectedDecoration.name,
              imageUrl: this.storage.publicUrl(
                user.selectedDecoration.imageUrl,
              ),
            }
          : null,
      badges: user.badges.map((badge) => badge.type),
      mediaBadges: user.mediaBadges.map((badge) => badge.mediaGroup),
      createdAt: user.createdAt.toISOString(),
      system: user.accountType === 'SYSTEM',
      banned: user.isBanned,
      position: user.position
        ? { displayName: user.position.displayName, color: user.position.color }
        : null,
      roles: user.roles.map((r) => r.role),
      online: user.isOnlineInGame,
      currentServer: user.isOnlineInGame ? user.currentServer : null,
      lastActivityAt: user.lastActivityAt?.toISOString() ?? null,
      statistics:
        showStats && user.statistics
          ? {
              playTimeMinutes: user.statistics.playTime,
              kills: user.statistics.kills,
              deaths: user.statistics.deaths,
              killDeathRatio: user.statistics.killDeathRatio,
            }
          : null,
      statisticsHidden: !showStats,
      friendsCount,
      achievementsCompleted,
    };
  }

  private applyPrivacy(user: OwnProfile): Record<string, unknown> {
    const visible: Record<string, unknown> = {
      id: user.id,
      shortId: user.shortId,
      tag: user.tag,
      discriminator: formatDiscriminator(user.discriminator),
      username: user.username,
      avatar: user.avatar,
      banner: user.banner,
      bannerPreset: user.bannerPreset,
      statusText: user.statusText,
      bio: user.bio,
      position: user.position,
      selectedDecoration: user.selectedDecoration,
      displayBadge: user.displayBadge,
      commentsEnabled: user.commentsEnabled,
      createdAt: user.createdAt,
    };

    if (!user.hideEmail) visible.email = user.email;
    if (!user.hideCountry) visible.country = user.country;
    if (!user.hideCity) visible.city = user.city;
    if (!user.hideGender) visible.gender = user.gender;
    if (!user.hideBirthDate && user.birthDate) {
      visible.birthDate = user.showBirthDate
        ? user.birthDate
        : {
            month: user.birthDate.getUTCMonth() + 1,
            day: user.birthDate.getUTCDate(),
          };
    }
    if (!user.hideSocials) visible.socialLinks = user.socialLinks;

    return visible;
  }

  async listSocialLinks(userId: string) {
    return this.prisma.socialLink.findMany({ where: { userId } });
  }

  async upsertSocialLink(
    userId: string,
    platform: SocialPlatform,
    dto: UpsertSocialLinkDto,
  ) {
    if (CONNECTED_PLATFORMS.has(platform)) {
      // Подтверждённую платформу нельзя «выдать» ручной ссылкой.
      throw new BadRequestException(
        'Этот аккаунт привязывается в «Привязанные аккаунты», а не ссылкой',
      );
    }
    const value = normalizeSocialValue(platform, dto.value);
    if (!value) {
      throw new BadRequestException(
        platform === 'GITHUB'
          ? 'Укажите ник GitHub или ссылку https://github.com/…'
          : 'Укажите ссылку, начинающуюся с https://',
      );
    }
    return this.prisma.socialLink.upsert({
      where: { userId_platform: { userId, platform } },
      create: { userId, platform, value },
      update: { value },
    });
  }

  async removeSocialLink(
    userId: string,
    platform: SocialPlatform,
  ): Promise<void> {
    await this.prisma.socialLink.deleteMany({ where: { userId, platform } });
  }

  async listOwnedDecorations(userId: string) {
    return this.prisma.userDecoration.findMany({
      where: { userId },
      include: { decoration: true },
      orderBy: { acquiredAt: 'desc' },
    });
  }

  async selectDecoration(
    userId: string,
    dto: SelectDecorationDto,
  ): Promise<{ success: true }> {
    if (!dto.decorationId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { selectedDecorationId: null },
      });
      return { success: true };
    }

    const owned = await this.prisma.userDecoration.findUnique({
      where: {
        userId_decorationId: { userId, decorationId: dto.decorationId },
      },
    });
    if (!owned) {
      throw new ForbiddenException('Эта декорация вам не принадлежит');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { selectedDecorationId: dto.decorationId },
    });
    return { success: true };
  }

  async report(
    reporterId: string,
    username: string,
    dto: CreateProfileReportDto,
  ): Promise<{ success: true }> {
    const profile = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
    if (!profile) {
      throw new NotFoundException('Профиль не найден');
    }
    if (profile.id === reporterId) {
      throw new ForbiddenException('Нельзя пожаловаться на самого себя');
    }
    await this.prisma.profileReport.upsert({
      where: { profileId_reporterId: { profileId: profile.id, reporterId } },
      create: {
        profileId: profile.id,
        reporterId,
        reason: dto.reason,
        description: dto.description,
      },
      update: { reason: dto.reason, description: dto.description },
    });
    return { success: true };
  }

  async createMediaRequest(userId: string, dto: CreateMediaRequestDto) {
    const existing = await this.prisma.userMediaBadge.findUnique({
      where: { userId_mediaGroup: { userId, mediaGroup: dto.mediaGroup } },
    });
    if (existing?.isApproved) {
      throw new ForbiddenException('Бейдж для этой платформы уже подтверждён');
    }
    return this.prisma.mediaBadgeRequest.create({ data: { userId, ...dto } });
  }

  async listMyMediaRequests(userId: string) {
    return this.prisma.mediaBadgeRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
