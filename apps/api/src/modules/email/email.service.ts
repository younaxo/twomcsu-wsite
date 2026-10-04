import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/// Без SMTP_HOST отправка молчит (логируется, не падает) — см. RISKS.md R4.
/// Письмо дополнительно логируется целиком вне production, чтобы можно было
/// пройти flow сброса пароля/верификации локально без настоящего SMTP.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST', '');
    if (host.length > 0) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT', 587),
        secure: this.config.get<boolean>('SMTP_SECURE', false),
        auth: {
          user: this.config.get<string>('SMTP_USER', ''),
          pass: this.config.get<string>('SMTP_PASSWORD', ''),
        },
      });
    }
  }

  async send(input: SendEmailInput): Promise<void> {
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.debug(
        `Email → ${input.to}: ${input.subject}\n${input.text ?? input.html}`,
      );
    }

    if (!this.transporter) {
      this.logger.warn(
        `SMTP_HOST не задан — письмо "${input.subject}" для ${input.to} не отправлено`,
      );
      return;
    }

    const fromName = this.config.get<string>('SMTP_FROM_NAME', 'TwoMC');
    const fromEmail = this.config.get<string>(
      'SMTP_FROM_EMAIL',
      'noreply@twomc.su',
    );

    await this.transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}
