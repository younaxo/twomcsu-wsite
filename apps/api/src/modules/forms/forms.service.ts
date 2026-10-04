import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Form,
  FormField,
  FormFieldType,
  FormStatus,
  FormVisibility,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { CaptchaService } from '../auth/captcha.service';
import { FriendsService } from '../friends/friends.service';
import { PermissionService } from '../roles/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { FieldAnswerDto } from './dto/field-answer.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { SubmitResponseDto } from './dto/submit-response.dto';

const VISIBILITY_PERMISSION: Partial<Record<FormVisibility, string>> = {
  HELPER_ONLY: 'forms.view.helper',
  MODERATOR_ONLY: 'forms.view.moderator',
  ADMIN_ONLY: 'forms.view.admin',
  OWNER_ONLY: 'forms.view.owner',
};

const MULTI_CHOICE_TYPES = new Set<FormFieldType>(['RADIO', 'SELECT']);
const MULTI_SELECT_TYPES = new Set<FormFieldType>(['CHECKBOX']);
const NUMBER_TYPES = new Set<FormFieldType>([
  'NUMBER',
  'RATING',
  'CURRENCY_AMOUNT',
]);
const DATE_TYPES = new Set<FormFieldType>(['DATE']);
const FILE_TYPES = new Set<FormFieldType>(['FILE_UPLOAD', 'IMAGE_GALLERY']);
const BOOLEAN_TYPES = new Set<FormFieldType>(['AGREEMENT_CHECKLIST']);
const NO_ANSWER_TYPES = new Set<FormFieldType>(['STATS_DISPLAY']);

interface FieldAnswerValues {
  textValue?: string;
  numberValue?: number;
  booleanValue?: boolean;
  dateValue?: Date;
  jsonValue?: Prisma.InputJsonValue;
  fileUrls?: string[];
}

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly captcha: CaptchaService,
    private readonly friends: FriendsService,
  ) {}

  async canView(
    visibility: FormVisibility,
    viewerId: string | null,
  ): Promise<boolean> {
    if (visibility === FormVisibility.PUBLIC) {
      return true;
    }
    if (visibility === FormVisibility.INVITE_ONLY) {
      return false;
    }
    if (!viewerId) {
      return false;
    }
    if (visibility === FormVisibility.AUTHENTICATED) {
      return true;
    }
    const permission = VISIBILITY_PERMISSION[visibility];
    return permission
      ? this.permissions.hasPermission(viewerId, permission)
      : false;
  }

  async listPublished(viewerId: string | null) {
    const all = await this.prisma.form.findMany({
      where: {
        status: FormStatus.PUBLISHED,
        visibility: { not: FormVisibility.INVITE_ONLY },
      },
      orderBy: { createdAt: 'desc' },
    });
    const visible = await Promise.all(
      all.map(async (f) =>
        (await this.canView(f.visibility, viewerId)) ? f : null,
      ),
    );
    return visible.filter((f) => f !== null);
  }

  async getMy(userId: string) {
    return this.prisma.form.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAutofill(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return { username: user.username, email: user.email };
  }

  async getFormByInviteCode(code: string) {
    const invite = await this.prisma.formInvite.findUnique({
      where: { code },
      include: { form: { include: { fields: { orderBy: { order: 'asc' } } } } },
    });
    if (!invite) {
      throw new NotFoundException('Приглашение не найдено');
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new ForbiddenException('Приглашение истекло');
    }
    if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
      throw new ForbiddenException('Приглашение исчерпано');
    }
    if (invite.form.status !== FormStatus.PUBLISHED) {
      throw new NotFoundException('Форма не найдена');
    }
    return invite.form;
  }

  async getBySlug(slug: string, viewerId: string | null) {
    const form = await this.prisma.form.findUnique({
      where: { slug },
      include: { fields: { orderBy: { order: 'asc' } } },
    });
    if (!form || form.status !== FormStatus.PUBLISHED) {
      throw new NotFoundException('Форма не найдена');
    }
    if (!(await this.canView(form.visibility, viewerId))) {
      throw new NotFoundException('Форма не найдена');
    }
    return form;
  }

  private async requireSubmittableForm(
    slug: string,
    viewerId: string | null,
    inviteCode: string | undefined,
  ): Promise<Form & { fields: FormField[] }> {
    const form = await this.prisma.form.findUnique({
      where: { slug },
      include: { fields: { orderBy: { order: 'asc' } } },
    });
    if (!form || form.status !== FormStatus.PUBLISHED) {
      throw new NotFoundException('Форма не найдена');
    }

    if (form.visibility === FormVisibility.INVITE_ONLY) {
      if (!inviteCode) {
        throw new NotFoundException('Форма не найдена');
      }
      const invite = await this.prisma.formInvite.findUnique({
        where: { code: inviteCode },
      });
      if (!invite || invite.formId !== form.id) {
        throw new NotFoundException('Приглашение не найдено');
      }
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new ForbiddenException('Приглашение истекло');
      }
      if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
        throw new ForbiddenException('Приглашение исчерпано');
      }
    } else if (!(await this.canView(form.visibility, viewerId))) {
      throw new NotFoundException('Форма не найдена');
    }

    if (form.requiresAuth && !viewerId) {
      throw new ForbiddenException('Для заполнения формы нужна авторизация');
    }
    const now = new Date();
    if (form.opensAt && form.opensAt > now) {
      throw new ForbiddenException('Форма ещё не открыта для ответов');
    }
    if (form.closesAt && form.closesAt < now) {
      throw new ForbiddenException('Приём ответов на форму закрыт');
    }
    if (
      form.maxResponses !== null &&
      form.responsesCount >= form.maxResponses
    ) {
      throw new ForbiddenException('Достигнут лимит ответов на форму');
    }

    return form;
  }

  private async assertNotAlreadyResponded(
    formId: string,
    userId: string | null,
  ): Promise<void> {
    if (!userId) {
      return;
    }
    const existing = await this.prisma.formResponse.findFirst({
      where: { formId, respondentId: userId, isComplete: true },
    });
    if (existing) {
      throw new ForbiddenException('Вы уже отправили ответ на эту форму');
    }
  }

  async submitResponse(
    slug: string,
    viewerId: string | null,
    dto: SubmitResponseDto,
    ip: string | undefined,
    userAgent: string | undefined,
  ) {
    const form = await this.requireSubmittableForm(
      slug,
      viewerId,
      dto.inviteCode,
    );

    if (form.onePerUser) {
      await this.assertNotAlreadyResponded(form.id, viewerId);
    }

    if (form.requiresCaptcha) {
      const ok = await this.captcha.verify(dto.captchaToken);
      if (!ok) {
        throw new BadRequestException('Капча не пройдена');
      }
    }

    const answersByFieldId = new Map(dto.answers.map((a) => [a.fieldId, a]));
    const prepared: Array<{ fieldId: string; data: FieldAnswerValues }> = [];

    for (const field of form.fields) {
      const answer = answersByFieldId.get(field.id);
      if (NO_ANSWER_TYPES.has(field.type)) {
        continue;
      }
      if (
        answer === undefined ||
        answer.value === undefined ||
        answer.value === null
      ) {
        if (field.isRequired) {
          throw new BadRequestException(
            `Поле «${field.label}» обязательно для заполнения`,
          );
        }
        continue;
      }
      prepared.push({
        fieldId: field.id,
        data: await this.buildAnswerData(field, answer, viewerId),
      });
    }

    const ipHash = ip
      ? createHash('sha256').update(ip).digest('hex')
      : undefined;

    const created = await this.prisma.$transaction(async (tx) => {
      const response = await tx.formResponse.create({
        data: {
          formId: form.id,
          respondentId: viewerId,
          isAnonymous: form.isAnonymous || !viewerId,
          ipHash,
          userAgent,
          isComplete: true,
          completedAt: new Date(),
          answers: {
            create: prepared.map((p) => ({ fieldId: p.fieldId, ...p.data })),
          },
        },
        include: { answers: true },
      });
      await tx.form.update({
        where: { id: form.id },
        data: { responsesCount: { increment: 1 } },
      });
      if (dto.inviteCode && form.visibility === FormVisibility.INVITE_ONLY) {
        await tx.formInvite.update({
          where: { code: dto.inviteCode },
          data: { usedCount: { increment: 1 } },
        });
      }
      return response;
    });

    return created;
  }

  async saveDraft(slug: string, viewerId: string, dto: SaveDraftDto) {
    const form = await this.prisma.form.findUnique({
      where: { slug },
      include: { fields: true },
    });
    if (!form || form.status !== FormStatus.PUBLISHED) {
      throw new NotFoundException('Форма не найдена');
    }

    const fieldsById = new Map(form.fields.map((f) => [f.id, f]));
    const existing = await this.prisma.formResponse.findFirst({
      where: { formId: form.id, respondentId: viewerId, isComplete: false },
    });

    const response =
      existing ??
      (await this.prisma.formResponse.create({
        data: {
          formId: form.id,
          respondentId: viewerId,
          currentStep: dto.currentStep ?? 0,
        },
      }));

    for (const answer of dto.answers) {
      const field = fieldsById.get(answer.fieldId);
      if (!field || answer.value === undefined || answer.value === null) {
        continue;
      }
      const data = await this.buildAnswerData(field, answer, viewerId);
      await this.prisma.formFieldAnswer.upsert({
        where: {
          responseId_fieldId: { responseId: response.id, fieldId: field.id },
        },
        create: { responseId: response.id, fieldId: field.id, ...data },
        update: data,
      });
    }

    if (dto.currentStep !== undefined) {
      await this.prisma.formResponse.update({
        where: { id: response.id },
        data: { currentStep: dto.currentStep },
      });
    }

    return this.prisma.formResponse.findUniqueOrThrow({
      where: { id: response.id },
      include: { answers: true },
    });
  }

  async listMyResponses(userId: string) {
    return this.prisma.formResponse.findMany({
      where: { respondentId: userId },
      include: { form: true, answers: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /// Значения из FieldAnswerDto приходят как `unknown` (JSON) — тип
  /// FormField определяет, в какую колонку FormFieldAnswer их положить и
  /// какую валидацию применить. Доменные ссылочные типы без своего домена
  /// (PLAYER_SELECTOR/RANK_SELECTOR/PRODUCT_SELECTOR/ORDER_SELECTOR/
  /// REPORT_REFERENCE/PUNISHMENT_REFERENCE/ACHIEVEMENT_SELECTOR) —
  /// принимаются без referential-проверки существования (PLAYER_SELECTOR/
  /// RANK_SELECTOR — нет соответствующих моделей в схеме вообще; остальные
  /// — PHASE 16/17/19, см. ADR-0027); NEWS_REFERENCE/TOPIC_REFERENCE/
  /// SERVER_SELECTOR/FRIENDS_SELECTOR проверяются по-настоящему, т.к. эти
  /// домены уже есть.
  private async buildAnswerData(
    field: FormField,
    answer: FieldAnswerDto,
    viewerId: string | null,
  ): Promise<FieldAnswerValues> {
    const value = answer.value;

    if (MULTI_CHOICE_TYPES.has(field.type)) {
      const options = (field.options as string[] | null) ?? [];
      if (
        typeof value !== 'string' ||
        (options.length > 0 && !options.includes(value))
      ) {
        throw new BadRequestException(
          `Недопустимое значение поля «${field.label}»`,
        );
      }
      return { textValue: value };
    }

    if (MULTI_SELECT_TYPES.has(field.type)) {
      const options = (field.options as string[] | null) ?? [];
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        throw new BadRequestException(
          `Поле «${field.label}» должно быть списком строк`,
        );
      }
      if (
        options.length > 0 &&
        value.some((v) => !options.includes(v as string))
      ) {
        throw new BadRequestException(
          `Недопустимое значение поля «${field.label}»`,
        );
      }
      return { jsonValue: value };
    }

    if (NUMBER_TYPES.has(field.type)) {
      const num = Number(value);
      if (Number.isNaN(num)) {
        throw new BadRequestException(
          `Поле «${field.label}» должно быть числом`,
        );
      }
      if (field.minValue !== null && num < field.minValue) {
        throw new BadRequestException(
          `Поле «${field.label}»: значение меньше минимального`,
        );
      }
      if (field.maxValue !== null && num > field.maxValue) {
        throw new BadRequestException(
          `Поле «${field.label}»: значение больше максимального`,
        );
      }
      return { numberValue: num };
    }

    if (BOOLEAN_TYPES.has(field.type)) {
      if (typeof value !== 'boolean') {
        throw new BadRequestException(
          `Поле «${field.label}» должно быть true/false`,
        );
      }
      if (field.isRequired && value !== true) {
        throw new BadRequestException(
          `Поле «${field.label}» должно быть подтверждено`,
        );
      }
      return { booleanValue: value };
    }

    if (DATE_TYPES.has(field.type)) {
      const date = new Date(value as string);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException(
          `Поле «${field.label}» должно быть датой`,
        );
      }
      return { dateValue: date };
    }

    if (FILE_TYPES.has(field.type)) {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        throw new BadRequestException(
          `Поле «${field.label}» должно быть списком ссылок на файлы`,
        );
      }
      if (field.maxFiles && value.length > field.maxFiles) {
        throw new BadRequestException(
          `Поле «${field.label}»: превышено число файлов`,
        );
      }
      return { fileUrls: value as string[] };
    }

    if (field.type === 'NEWS_REFERENCE') {
      if (typeof value !== 'string') {
        throw new BadRequestException(
          `Поле «${field.label}» должно ссылаться на новость`,
        );
      }
      const news = await this.prisma.news.findUnique({ where: { id: value } });
      if (!news || news.status !== 'PUBLISHED') {
        throw new BadRequestException(
          `Поле «${field.label}»: новость не найдена`,
        );
      }
      return { textValue: value };
    }

    if (field.type === 'TOPIC_REFERENCE') {
      if (typeof value !== 'string') {
        throw new BadRequestException(
          `Поле «${field.label}» должно ссылаться на тему`,
        );
      }
      const topic = await this.prisma.topic.findUnique({
        where: { id: value },
      });
      if (!topic || !topic.isActive) {
        throw new BadRequestException(`Поле «${field.label}»: тема не найдена`);
      }
      return { textValue: value };
    }

    if (field.type === 'SERVER_SELECTOR') {
      if (typeof value !== 'string') {
        throw new BadRequestException(
          `Поле «${field.label}» должно ссылаться на сервер`,
        );
      }
      const server = await this.prisma.server.findUnique({
        where: { id: value },
      });
      if (!server || !server.isActive) {
        throw new BadRequestException(
          `Поле «${field.label}»: сервер не найден`,
        );
      }
      return { textValue: value };
    }

    if (field.type === 'FRIENDS_SELECTOR') {
      if (typeof value !== 'string') {
        throw new BadRequestException(
          `Поле «${field.label}» должно ссылаться на пользователя`,
        );
      }
      if (viewerId) {
        const isFriend = await this.friends.isFriend(viewerId, value);
        if (!isFriend) {
          throw new BadRequestException(
            `Поле «${field.label}»: пользователь не найден в списке друзей`,
          );
        }
      }
      return { textValue: value };
    }

    // TEXT/TEXTAREA/EMAIL/PHONE/URL/COLOR_PICKER/CODE_EDITOR/
    // MARKDOWN_EDITOR/VIDEO_URL/SIGNATURE/TIME/SCHEDULE_PICKER/
    // DATE_RANGE + доменные *_SELECTOR/*_REFERENCE без своей реализации —
    // генерический путь: строка в textValue, остальное (объекты/массивы)
    // в jsonValue.
    if (typeof value === 'string') {
      if (field.minLength && value.length < field.minLength) {
        throw new BadRequestException(
          `Поле «${field.label}»: слишком короткое значение`,
        );
      }
      if (field.maxLength && value.length > field.maxLength) {
        throw new BadRequestException(
          `Поле «${field.label}»: слишком длинное значение`,
        );
      }
      return { textValue: value };
    }
    return { jsonValue: value as Prisma.InputJsonValue };
  }
}
