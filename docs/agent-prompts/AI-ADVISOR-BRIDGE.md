# AI Advisor Bridge

## Purpose

AI Advisor Bridge — контролируемый канал для консультации внешней модели через OpenAI API. Это не доступ к личному чату ChatGPT: API-модель не видит историю личных разговоров, пока владелец явно не передаст подготовленный контекст.

## Safe request flow

1. `twomc-ai-advisor-bridge` готовит локальный request pack: вопрос, минимальный контекст, redactions, желаемый формат ответа, лимит токенов и оценку стоимости.
2. Owner Liaison показывает pack владельцу и запрашивает явное согласие на отправку и расходы.
3. Владелец сам предоставляет уже существующий `OPENAI_API_KEY` через безопасное окружение. Агент не создаёт ключи, аккаунты, биллинг или платные ресурсы.
4. Только после согласия отдельный будущий adapter отправляет ровно утверждённый pack, с model allowlist, timeout, retry cap, token/cost cap и audit metadata без секретов.
5. Ответ сохраняется как advisory artifact с моделью, временем, входным hash, ограничениями и отметкой `advice, not authority`.

## Boundaries

- По умолчанию мост выключен; текущая конфигурация не делает API-вызовов.
- Не отправлять `.env`, credentials, персональные данные, приватные логи, полный репозиторий или содержимое личного чата.
- Никаких автоматических покупок, подписок, ключей, внешних записей или исполнения совета.
- В рамках заранее утверждённого roadmap slice Claude может работать автономно офлайн. Новый scope, расходы, отправка данных, production/deploy и другие внешние действия всегда возвращаются владельцу.
- Совет проверяется по требованиям, ADR, архитектуре, безопасности и независимому review до использования.

## Request pack

- Decision requested:
- Minimal redacted context:
- Alternatives already considered:
- Constraints and non-goals:
- Maximum tokens/cost:
- Data classification:
- Owner consent reference:
- Expected answer format:
