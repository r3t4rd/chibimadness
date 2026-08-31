# Боевой AI NPC

## Назначение

Production NPC используют детерминированный utility AI в Rust. Внешний AI-сервис и ML runtime для боя не требуются: одинаковое входное состояние и seed дают воспроизводимое решение.

Цели модели:

- разные дистанции и роли для оружия;
- читаемый телеграф перед уроном;
- ограниченное число одновременных атакующих;
- память о недавно потерянной цели;
- фланг, удержание позиции и отход вместо постоянного прямого преследования;
- возрастающая угроза уровней 1–40 без превращения первого противника в одно попадание.

## Уровни

Стартовые 40 мобов получают стабильный aiLevel в **src/game/constants.ts**. Rust нормализует его в диапазон 1–40 и выбирает профиль.

Health floor:

~~~text
450 + (level - 1) × 35
~~~

Он применяется после authored maxHp × health multiplier. Текущее здоровье сохраняет исходную долю от maxHp.

| Уровни | Tier | Health floor | Одновременные attack tokens |
| --- | --- | ---: | ---: |
| 1–8 | training | 450–695 | 1 |
| 9–16 | street | 730–975 | 2 |
| 17–24 | tactical | 1010–1255 | 3 |
| 25–32 | elite | 1290–1535 | 4 |
| 33–40 | nemesis | 1570–1815 | 5 |

Внутри tier линейно меняются health, damage, speed и perception multipliers, а также:

- aggression;
- self-preservation;
- coordination;
- flank bias;
- patience;
- preferred range;
- reaction window;
- attack cooldown;
- aim lead.

Профиль первого tier медленнее реагирует, реже атакует и видит с меньшей дистанции, но получает минимум 450 HP. Высокие tier быстрее координируются, точнее ведут цель и допускают больше committed attackers.

## Архетипы

Архетип выбирается из weapon type, monster type и boss flag.

| Архетип | Типичное оружие/роль | Preferred distance | Attack range | Base telegraph |
| --- | --- | ---: | ---: | ---: |
| rusher | bat, baton, blade, wolf | 54 | 82 | 0.28 s |
| shooter | стандартный ranged fallback | 310 | 560 | 0.42 s |
| flanker | shotgun, brawler | 225 | 430 | 0.50 s |
| sniper | cheytac, sniper | 650 | 790 | 1.10 s |
| tank | sledgehammer, riot shield, boss fallback | 78 | 105 | 0.58 s |
| controller | molotov, staff | 390 | 620 | 0.72 s |

Difficulty profile масштабирует эти базовые параметры, но hard clamps сохраняют минимальные reaction/cooldown окна и ограничивают aim lead.

## Цикл решения

1. Сервер ищет ближайшего допустимого игрока в perception range.
2. AgentBrain обновляет last seen position и memory timer.
3. Для advance, hold, flank и retreat считаются utility scores.
4. Сервер распределяет attack tokens отдельно внутри каждой faction.
5. Агент без token продолжает позиционирование и не создаёт урон.
6. Агент с token входит в telegraph state.
7. Потеря token во время телеграфа отменяет pending attack.
8. После завершённого телеграфа сервер создаёт projectile или melee hit.

Aim prediction использует velocity цели, но рассчитанная точка всегда ограничивается world bounds.

## Читаемость боя

Сервер публикует:

- aiArchetype и aiIntent;
- attackCommitted и attackToken;
- telegraphRemaining и telegraphDuration;
- telegraphAimX/telegraphAimY;
- aiLevel и aiTier.

**worldRenderer.ts** рисует линию/кольцо телеграфа и цветную метку AI level. Renderer не выбирает действие и не создаёт authoritative урон.

## Horde

Horde-мобы получают уровень из времени текущего забега. Обычные противники постепенно растут до 40; boss получает минимум nemesis tier. Базовые horde HP/attack уже масштабируются director-ом, а level управляет поведением и perception.

## Настройка

- Roster и конкретный aiLevel: **src/game/constants.ts**.
- Tier ranges и stat curves: DifficultyProfile в **server/src/ai.rs**.
- Архетипы: Archetype::from_labels и Archetype::profile.
- Runtime application: sanitize_world_monsters и tick_combat_world в **server/src/main.rs**.
- Визуальный телеграф: drawMonsterAiTelegraph в **src/game/worldRenderer.ts**.

При изменении кривой проверяйте не только средний win/loss outcome, но и:

- time-to-kill первого моба;
- возможность нового игрока принять управление до aggro;
- число одновременных committed attackers;
- наличие телеграфа перед каждым server projectile;
- отмену pending attack при потере token;
- поведение ranged NPC на низком HP;
- отсутствие выхода NPC за world bounds.

## Автоматические проверки

~~~bash
cargo test --manifest-path server/Cargo.toml
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
~~~

Тесты покрывают выбор архетипа, память цели, retreat, attack-token boundary, telegraph-before-fire, масштабирование уровней и стартовую aggro-дистанцию. Финальное ощущение сложности проверяется вручную в игровом build.
