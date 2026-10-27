# Pixel Tower Defense

Браузерная tower defense на HTML5 Canvas и JavaScript: процедурные карты, бесконечные волны, развитие башен и карточки улучшений.

## Запуск

Из папки проекта:

```sh
~/.local/bin/uv run --no-project --python 3.12 python serve.py 8000
```

Открыть http://localhost:8000.

Сохранения хранятся в localStorage браузера. Серверная база лидеров создаётся автоматически в `data/` и не включена в Git.

Ключевые решения по гейм-дизайну: [GAME_DESIGN.md](GAME_DESIGN.md).
