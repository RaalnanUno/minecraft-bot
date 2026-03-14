# GitHub Copilot Instructions

## Project overview

This project is a local Minecraft bot system built with:

- Node.js
- CommonJS modules (`require` / `module.exports`)
- `mineflayer`
- `mineflayer-pathfinder`

The project contains multiple bots with different roles, including:

- `alphaBot.js` — nearby harvesting, regrouping, basic combat, first-tool bootstrap
- `bot.js` — general purpose companion bot with Ollama chat support
- other role bots such as `bravoBot.js`, `charlieBot.js`, and `deltaBot.js`

The codebase is command-driven and behavior-driven. Bots respond to chat commands, perform actions, and manage internal state such as movement, combat, harvesting, and crafting.

---

## Primary development goals

When generating or editing code for this project, prefer solutions that support these goals:

1. Keep bots near the player or group.
2. Harvest nearby resources safely.
3. Avoid digging holes the bot cannot escape.
4. Craft tools and utility items in a step-by-step way.
5. Fight nearby hostile mobs when appropriate.
6. Support cancellation and task interruption cleanly.
7. Keep behavior modular by placing reusable logic in `actions/` or `utils/`.

---

## Code style requirements

### General style

- Use **CommonJS** syntax, not ES modules.
- Prefer **plain JavaScript** compatible with the current project style.
- Match the formatting and naming style already used in the repository.
- Prefer small helper functions over large deeply nested logic.
- Keep functions focused on one behavior.
- Export reusable functions with `module.exports = { ... }`.

### Naming

- Use clear function names such as:
  - `moveNearBlock`
  - `collectNearbyDrops`
  - `fightNearestHostile`
  - `bootstrapFirstTool`
- Use descriptive state names such as:
  - `idle`
  - `moving`
  - `harvesting`
  - `collecting`
  - `fighting`
  - `auto_follow`
  - `auto_defend`

### Async behavior

- Use `async` / `await`.
- Wrap movement, digging, combat, and crafting calls in `try/catch` when failure is possible.
- Prefer small `sleep(ms)` helpers where timing pauses are needed.
- Never use top-level `await` in CommonJS files.

---

## Architectural rules

### 1. Reuse existing actions before creating new ones

Before adding new logic, check whether the behavior belongs in one of these existing modules:

- `actions/bootstrapFirstTool.js`
- `actions/collectDrops.js`
- `actions/cutTree.js`
- `actions/fightHostiles.js`
- `actions/followPlayer.js`
- `actions/harvestNearby.js`
- `actions/mineMaterial.js`
- `actions/mineStone.js`
- `utils/teleportOrMoveToPlayer.js`

If similar logic already exists, extend or reuse it rather than duplicating it.

### 2. Keep bot entry files thin

Files like `alphaBot.js` and `bot.js` should mainly:

- create the bot
- load plugins
- maintain state
- handle chat commands
- schedule autonomy ticks
- call reusable action functions

Do not move large blocks of harvesting, combat, or crafting logic directly into bot entry files unless absolutely necessary.

### 3. Preserve task cancellation patterns

This project already uses a task token and cancel pattern. New behavior should follow the same pattern.

Preferred existing pattern:

- `nextTaskToken()`
- `makeShouldCancel(taskToken)`
- `interruptCurrentTask(reason)`
- `finishTask(taskToken)`

New long-running actions should accept:

```js
options.shouldCancel
