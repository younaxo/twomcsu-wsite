# Git, production and secrets

- До записи проверить `git status --short --branch`; сохранить чужой WIP.
- Запрещены push, merge, rebase, hard reset, clean, deploy, publish, migrations и seed без новой явной команды владельца.
- Не читать и не выводить `.env*`, credential-файлы и `C:\Users\younaxo\.twomc\secrets`.
- Файл учётных данных стенда (`/home/twomc/test-website-credentials.txt`), `/srv/twomc-stand/stand.env` и `gate.token` читает только главный агент (twomc-chief) и только при необходимости. Исполнителям передаются только путь и команда проверки (`verify.sh`, `run-smoke.sh`, `run-visual.sh`), не содержимое; исполнители эти файлы не читают, не ищут по ним и не выводят (решение владельца 28.11.2026, R173).
- Исключение из запрета deploy: ежедневная выкладка ТЕСТОВОГО стенда test-website.twomc.su готовым скриптом `infrastructure/test-website/release.sh` (+ смоук и визуальная проверка) разрешена главному агенту и директору платформы; без вывода секретов; production и giveaway — запрещены (решение владельца 28.11.2026).
- Python и pip запрещены во всех сеансах (используй node/bash); дополнительно действует PreToolUse-хук `.claude/hooks/deny-python.mjs` (вводится отдельным PR).
- Не создавать ключи, токены, платные ресурсы или аккаунты автоматически.
- Permission deny rules — дополнительный барьер, а не абсолютная security boundary; человеческое подтверждение остаётся обязательным.
