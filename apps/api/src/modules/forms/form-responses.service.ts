import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFormInviteDto } from './dto/create-form-invite.dto';
import { ListResponsesQueryDto } from './dto/list-responses-query.dto';

@Injectable()
export class FormResponsesService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireForm(formId: string) {
    const form = await this.prisma.form.findUnique({ where: { id: formId } });
    if (!form) {
      throw new NotFoundException('Форма не найдена');
    }
    return form;
  }

  async getResponses(formId: string, query: ListResponsesQueryDto) {
    await this.requireForm(formId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where = { formId };
    const [items, total] = await Promise.all([
      this.prisma.formResponse.findMany({
        where,
        include: { respondent: true, answers: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.formResponse.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getResponse(formId: string, responseId: string) {
    await this.requireForm(formId);
    const response = await this.prisma.formResponse.findUnique({
      where: { id: responseId },
      include: { respondent: true, answers: { include: { field: true } } },
    });
    if (!response || response.formId !== formId) {
      throw new NotFoundException('Ответ не найден');
    }
    return response;
  }

  async deleteResponse(formId: string, responseId: string): Promise<void> {
    const response = await this.prisma.formResponse.findUnique({
      where: { id: responseId },
    });
    if (!response || response.formId !== formId) {
      throw new NotFoundException('Ответ не найден');
    }
    await this.prisma.$transaction([
      this.prisma.formResponse.delete({ where: { id: responseId } }),
      this.prisma.form.update({
        where: { id: formId },
        data: { responsesCount: { decrement: 1 } },
      }),
    ]);
  }

  /// Для RADIO/CHECKBOX/SELECT — распределение ответов по вариантам;
  /// для остальных типов — только количество заполненных ответов.
  async getStats(formId: string) {
    const form = await this.requireForm(formId);
    const [totalResponses, completeResponses, fields] = await Promise.all([
      this.prisma.formResponse.count({ where: { formId } }),
      this.prisma.formResponse.count({ where: { formId, isComplete: true } }),
      this.prisma.formField.findMany({
        where: { formId },
        orderBy: { order: 'asc' },
      }),
    ]);

    const fieldStats = await Promise.all(
      fields.map(async (field) => {
        const answers = await this.prisma.formFieldAnswer.findMany({
          where: { fieldId: field.id },
          select: { textValue: true, jsonValue: true },
        });
        const breakdown: Record<string, number> = {};
        if (['RADIO', 'SELECT'].includes(field.type)) {
          for (const a of answers) {
            if (a.textValue) {
              breakdown[a.textValue] = (breakdown[a.textValue] ?? 0) + 1;
            }
          }
        } else if (field.type === 'CHECKBOX') {
          for (const a of answers) {
            const values = Array.isArray(a.jsonValue)
              ? (a.jsonValue as string[])
              : [];
            for (const v of values) {
              breakdown[v] = (breakdown[v] ?? 0) + 1;
            }
          }
        }
        return {
          fieldId: field.id,
          label: field.label,
          answeredCount: answers.length,
          breakdown,
        };
      }),
    );

    return {
      formId,
      totalResponses,
      completeResponses,
      completionRate:
        totalResponses > 0 ? completeResponses / totalResponses : 0,
      maxResponses: form.maxResponses,
      fieldStats,
    };
  }

  async listMyFormResponses(userId: string) {
    return this.prisma.formResponse.findMany({
      where: { respondentId: userId },
      include: { form: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listInvites(formId: string) {
    await this.requireForm(formId);
    return this.prisma.formInvite.findMany({
      where: { formId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvite(
    formId: string,
    createdBy: string,
    dto: CreateFormInviteDto,
  ) {
    await this.requireForm(formId);
    return this.prisma.formInvite.create({
      data: {
        formId,
        code: randomBytes(16).toString('hex'),
        createdBy,
        maxUses: dto.maxUses,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async deleteInvite(formId: string, code: string): Promise<void> {
    const invite = await this.prisma.formInvite.findUnique({ where: { code } });
    if (!invite || invite.formId !== formId) {
      throw new NotFoundException('Приглашение не найдено');
    }
    await this.prisma.formInvite.delete({ where: { code } });
  }
}
