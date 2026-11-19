import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { Response } from 'express';
import {
  PunishmentsErrorHeadersFilter,
  setPrivateNoStore,
  suppressEtag,
} from './punishments-http';

/// Контракт 6.1: ETag только у публичного 200. Express ставит ETag сам при
/// res.send/json (до writeHead); модуль снимает его у конкретного ответа.
function realRes(): ServerResponse {
  return new ServerResponse(new IncomingMessage(new Socket()));
}

function asExpress(res: ServerResponse): Response {
  return res as unknown as Response;
}

describe('ETag у ответов punishments (контракт 6.1)', () => {
  it('без suppressEtag ETag, выставленный до writeHead, остаётся (контроль)', () => {
    const res = realRes();
    res.setHeader('ETag', 'W/"x"');
    res.writeHead(200);
    expect(res.getHeader('ETag')).toBe('W/"x"');
  });

  it('suppressEtag снимает ETag, поставленный Express перед отправкой', () => {
    const res = realRes();
    suppressEtag(asExpress(res));
    res.setHeader('ETag', 'W/"x"');
    res.writeHead(200);
    expect(res.getHeader('ETag')).toBeUndefined();
  });

  it('setPrivateNoStore («Мои» и admin): no-store и без ETag', () => {
    const res = realRes();
    setPrivateNoStore(asExpress(res));
    res.setHeader('ETag', 'W/"x"');
    res.writeHead(200);
    expect(res.getHeader('Cache-Control')).toBe('private, no-store');
    expect(res.getHeader('ETag')).toBeUndefined();
  });

  it.each([404, 429, 503, 403, 400])('фильтр ошибок: %s без ETag', (status) => {
    const res = realRes();
    const express = Object.assign(res, {
      status(code: number) {
        res.statusCode = code;
        return express;
      },
      json() {
        res.setHeader('ETag', 'W/"x"');
        res.writeHead(res.statusCode);
        return express;
      },
    });
    const host = {
      switchToHttp: () => ({ getResponse: () => express }),
    } as unknown as ArgumentsHost;
    new PunishmentsErrorHeadersFilter().catch(
      new HttpException('x', status),
      host,
    );
    expect(res.getHeader('ETag')).toBeUndefined();
    expect(res.getHeader('Cache-Control')).toBe('no-store');
  });
});
