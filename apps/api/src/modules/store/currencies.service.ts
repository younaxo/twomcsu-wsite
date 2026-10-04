import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCurrencyRateDto } from './dto/create-currency-rate.dto';
import { CurrencyExchangeDto } from './dto/currency-exchange.dto';
import { UpdateCurrencyRateDto } from './dto/update-currency-rate.dto';

@Injectable()
export class CurrenciesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive() {
    return this.prisma.currencyRate.findMany({ where: { isActive: true } });
  }

  /// Тот же список активных курсов, в форме, которую ждёт калькулятор обмена
  /// на витрине (ключ — код валюты).
  async getGameCurrencyRates() {
    const rates = await this.listActive();
    return Object.fromEntries(rates.map((r) => [r.currency, r]));
  }

  async listAdmin() {
    return this.prisma.currencyRate.findMany({ orderBy: { currency: 'asc' } });
  }

  async create(dto: CreateCurrencyRateDto) {
    const existing = await this.prisma.currencyRate.findUnique({
      where: { currency: dto.currency },
    });
    if (existing) {
      throw new ConflictException('Курс для этой валюты уже существует');
    }
    return this.prisma.currencyRate.create({ data: dto });
  }

  async update(currency: string, dto: UpdateCurrencyRateDto) {
    const existing = await this.prisma.currencyRate.findUnique({
      where: { currency },
    });
    if (!existing) {
      throw new NotFoundException('Курс не найден');
    }
    return this.prisma.currencyRate.update({ where: { currency }, data: dto });
  }

  /// Калькулятор конвертации между валютами по сохранённым курсам (rate —
  /// курс к условной базовой единице). Это именно калькулятор: баланса
  /// валюты у пользователя в схеме нет (PlayerStatistics.coins пушится
  /// игровым сервером, см. ADR), обмен не списывает/не начисляет ничего —
  /// см. ADR Store.
  async exchange(dto: CurrencyExchangeDto) {
    if (dto.fromCurrency === dto.toCurrency) {
      throw new BadRequestException('Валюты обмена должны отличаться');
    }
    const [from, to] = await Promise.all([
      this.prisma.currencyRate.findUnique({
        where: { currency: dto.fromCurrency },
      }),
      this.prisma.currencyRate.findUnique({
        where: { currency: dto.toCurrency },
      }),
    ]);
    if (!from || !from.isActive) {
      throw new NotFoundException(`Валюта ${dto.fromCurrency} недоступна`);
    }
    if (!to || !to.isActive) {
      throw new NotFoundException(`Валюта ${dto.toCurrency} недоступна`);
    }
    const baseAmount = from.rate.times(dto.amount);
    const result = baseAmount.dividedBy(to.rate);
    return {
      fromCurrency: dto.fromCurrency,
      toCurrency: dto.toCurrency,
      amount: dto.amount,
      result: result.toDecimalPlaces(2),
    };
  }
}
