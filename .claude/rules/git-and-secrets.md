# Git, production and secrets

- До записи проверить `git status --short --branch`; сохранить чужой WIP.
- Запрещены push, merge, rebase, hard reset, clean, deploy, publish, migrations и seed без новой явной команды владельца.
- Не читать и не выводить `.env*`, credential-файлы и `C:\Users\younaxo\.twomc\secrets`.
- Не создавать ключи, токены, платные ресурсы или аккаунты автоматически.
- Permission deny rules — дополнительный барьер, а не абсолютная security boundary; человеческое подтверждение остаётся обязательным.
