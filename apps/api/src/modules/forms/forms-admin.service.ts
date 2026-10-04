import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FormFieldType, FormStatus, Prisma } from '@prisma/client';
import { escapeToHtml } from '../../common/html.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFormDto } from './dto/create-form.dto';
import { FormFieldDto } from './dto/form-field.dto';
import { ListAdminFormsQueryDto } from './dto/list-admin-forms-query.dto';
import { UpdateFormDto } from './dto/update-form.dto';

const CHOICE_TYPES = new Set<FormFieldType>(['RADIO', 'CHECKBOX', 'SELECT']);

@Injectable()
export class FormsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private validateFields(fields: FormFieldDto[]): void {
    for (const field of fields) {
      if (
        CHOICE_TYPES.has(field.type) &&
        (!field.options || field.options.length === 0)
      ) {
        throw new BadRequestException(
          `Поле «${field.label}» типа ${field.type} требует непустой список options`,
        );
      }
    }
  }

  async listAdmin(query: ListAdminFormsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.FormWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.form.findMany({
        where,
        include: {
          createdBy: true,
          _count: { select: { fields: true, responses: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.form.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getFormById(id: string) {
    const form = await this.prisma.form.findUnique({
      where: { id },
      include: { createdBy: true, fields: { orderBy: { order: 'asc' } } },
    });
    if (!form) {
      throw new NotFoundException('Форма не найдена');
    }
    return form;
  }

  private toFieldCreateInput(
    f: FormFieldDto,
    index: number,
  ): Prisma.FormFieldCreateWithoutFormInput {
    return {
      type: f.type,
      label: f.label,
      description: f.description,
      placeholder: f.placeholder,
      isRequired: f.isRequired,
      order: f.order ?? index,
      stepIndex: f.stepIndex,
      options: f.options as Prisma.InputJsonValue,
      validation: f.validation as Prisma.InputJsonValue,
      conditionalLogic: f.conditionalLogic as Prisma.InputJsonValue,
      defaultValue: f.defaultValue,
      minValue: f.minValue,
      maxValue: f.maxValue,
      minLength: f.minLength,
      maxLength: f.maxLength,
      maxFiles: f.maxFiles,
      maxFileSize: f.maxFileSize,
      allowedMimes: f.allowedMimes,
    };
  }

  async createForm(createdById: string, dto: CreateFormDto) {
    this.validateFields(dto.fields);
    const existing = await this.prisma.form.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Форма с таким slug уже существует');
    }
    const { fields, description, ...rest } = dto;
    return this.prisma.form.create({
      data: {
        ...rest,
        createdById,
        description,
        descriptionHtml: description ? escapeToHtml(description) : undefined,
        opensAt: dto.opensAt ? new Date(dto.opensAt) : undefined,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
        fields: {
          create: fields.map((f, index) => this.toFieldCreateInput(f, index)),
        },
      },
      include: { fields: { orderBy: { order: 'asc' } } },
    });
  }

  async updateForm(id: string, dto: UpdateFormDto) {
    const form = await this.prisma.form.findUnique({ where: { id } });
    if (!form) {
      throw new NotFoundException('Форма не найдена');
    }
    if (dto.fields) {
      this.validateFields(dto.fields);
    }

    const { fields, description, opensAt, closesAt, ...rest } = dto;
    return this.prisma.form.update({
      where: { id },
      data: {
        ...rest,
        ...(description !== undefined
          ? { description, descriptionHtml: escapeToHtml(description) }
          : {}),
        ...(opensAt ? { opensAt: new Date(opensAt) } : {}),
        ...(closesAt ? { closesAt: new Date(closesAt) } : {}),
        ...(fields
          ? {
              fields: {
                deleteMany: {},
                create: fields.map((f, index) =>
                  this.toFieldCreateInput(f, index),
                ),
              },
            }
          : {}),
      },
      include: { fields: { orderBy: { order: 'asc' } } },
    });
  }

  /// "Удаление" формы — архивация (status=ARCHIVED, deletedAt), не hard
  /// delete: у формы есть реальные ответы респондентов, которые нельзя
  /// обессмысливать.
  async archiveForm(id: string): Promise<void> {
    const form = await this.prisma.form.findUnique({ where: { id } });
    if (!form) {
      throw new NotFoundException('Форма не найдена');
    }
    await this.prisma.form.update({
      where: { id },
      data: { status: FormStatus.ARCHIVED, deletedAt: new Date() },
    });
  }

  async publishForm(id: string) {
    const form = await this.prisma.form.findUnique({
      where: { id },
      include: { fields: true },
    });
    if (!form) {
      throw new NotFoundException('Форма не найдена');
    }
    if (form.fields.length === 0) {
      throw new BadRequestException('Нельзя опубликовать форму без полей');
    }
    return this.prisma.form.update({
      where: { id },
      data: { status: FormStatus.PUBLISHED },
    });
  }

  async closeForm(id: string) {
    const form = await this.prisma.form.findUnique({ where: { id } });
    if (!form) {
      throw new NotFoundException('Форма не найдена');
    }
    return this.prisma.form.update({
      where: { id },
      data: { status: FormStatus.CLOSED },
    });
  }

  async duplicateForm(id: string, createdById: string) {
    const original = await this.prisma.form.findUnique({
      where: { id },
      include: { fields: true },
    });
    if (!original) {
      throw new NotFoundException('Форма не найдена');
    }
    let slug = `${original.slug}-copy`;
    let suffix = 2;
    while (await this.prisma.form.findUnique({ where: { slug } })) {
      slug = `${original.slug}-copy-${suffix}`;
      suffix += 1;
    }
    return this.prisma.form.create({
      data: {
        slug,
        title: `${original.title} (копия)`,
        description: original.description,
        descriptionHtml: original.descriptionHtml,
        coverImage: original.coverImage,
        status: FormStatus.DRAFT,
        visibility: original.visibility,
        createdById,
        maxResponses: original.maxResponses,
        onePerUser: original.onePerUser,
        isAnonymous: original.isAnonymous,
        showResults: original.showResults,
        requiresAuth: original.requiresAuth,
        requiresCaptcha: original.requiresCaptcha,
        multiStep: original.multiStep,
        stepsConfig: original.stepsConfig as Prisma.InputJsonValue,
        customCss: original.customCss,
        thankYouMessage: original.thankYouMessage,
        redirectUrl: original.redirectUrl,
        fields: {
          create: original.fields.map((f) => ({
            type: f.type,
            label: f.label,
            description: f.description,
            placeholder: f.placeholder,
            isRequired: f.isRequired,
            order: f.order,
            stepIndex: f.stepIndex,
            options: f.options as Prisma.InputJsonValue,
            validation: f.validation as Prisma.InputJsonValue,
            conditionalLogic: f.conditionalLogic as Prisma.InputJsonValue,
            defaultValue: f.defaultValue,
            minValue: f.minValue,
            maxValue: f.maxValue,
            minLength: f.minLength,
            maxLength: f.maxLength,
            maxFiles: f.maxFiles,
            maxFileSize: f.maxFileSize,
            allowedMimes: f.allowedMimes,
          })),
        },
      },
      include: { fields: { orderBy: { order: 'asc' } } },
    });
  }
}
