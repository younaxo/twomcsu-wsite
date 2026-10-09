# Скриншоты tutorial регистрации

Слоты описаны в `apps/web/src/lib/auth/tutorial.ts` (`TUTORIAL_STEPS[].image`).
Пока `src: null`, tutorial показывает явно помеченный временный макет.

Чтобы добавить реальный скриншот:

1. Положить файл сюда: `apps/web/public/assets/tutorial/<id>.webp`
   (`register`, `site-connect`, `open-link`, `enter-code`, `confirm-in-game`, `done`).
   Рекомендуется 1600×1000 (16:10), WebP/AVIF, без мелкого текста на краях.
2. В `TUTORIAL_STEPS` указать `image.src: '/assets/tutorial/<id>.webp'` и точный `alt`.

Не использовать выдуманные интерфейсы Minecraft — только реальные скриншоты
серверов TwoMC и сайта twomc.su.
