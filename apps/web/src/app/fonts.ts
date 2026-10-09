/// Production-шрифты направления «Полдень»: Onest — весь UI, Literata —
/// редакционный текст (новости, правила), JetBrains Mono — id/координаты/
/// таймстампы. Self-hosted из npm-пакетов fontsource (woff2 по unicode-range:
/// latin + cyrillic грузятся отдельно, остальные subsets — только по
/// необходимости). Никаких запросов к Google Fonts ни в сборке, ни в рантайме.
/// Имена семейств (`Onest Variable` и т. д.) закреплены в src/styles/tokens.css.
import '@fontsource-variable/onest/wght.css';
import '@fontsource-variable/literata/wght.css';
import '@fontsource-variable/literata/wght-italic.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
