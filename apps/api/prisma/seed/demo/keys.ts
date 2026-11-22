/// Устойчивые ключи демо-форм: позволяют upsert по id без изменения схемы.
export function demoFieldId(formSlug: string, order: number): string {
  return `demo-field-${formSlug}-${order}`;
}

export function demoResponseId(formSlug: string): string {
  return `demo-response-${formSlug}`;
}
