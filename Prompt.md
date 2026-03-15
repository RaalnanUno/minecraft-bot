# CodePromptBuilder Project Prompt

I want to refactor BravoBot to use mineflayer-tool.
We'll eventually want to share the abilities, so don't stovepipe the bot.

npm install mineflayer-tool

## actions/bootstrapFirstTool.js

```js
const { goals } = require('mineflayer-pathfinder')
const { cutTree } = require('./cutTree')
const { collectNearbyDrops } = require('./collectDrops')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getItemByName(bot, name) {
  return bot.inventory.items().find(item => item.name === name) || null
}

function getItemCount(bot, itemName) {
  return bot.inventory
    .items()
    .filter(item => item.name === itemName)
    .reduce((sum, item) => sum + item.count, 0)
}

function hasItem(bot, itemName, minCount = 1) {
  return getItemCount(bot, itemName) >= minCount
}

function getRecipeItemId(bot, itemName) {
  const item = bot.registry.itemsByName[itemName]
  return item ? item.id : null
}

async function craftItem(bot, itemName, count = 1, craftingTableBlock = null) {
  const itemId = getRecipeItemId(bot, itemName)
  if (!itemId) {
    throw new Error(`Unknown craft item: ${itemName}`)
  }

  const recipes = bot.recipesFor(itemId, null, 1, craftingTableBlock || null)
  if (!recipes || recipes.length === 0) {
    throw new Error(`No recipe available for ${itemName}`)
  }

  await bot.craft(recipes[0], count, craftingTableBlock || null)
}

function findNearbyPlacePosition(bot, maxDistance = 4) {
  const base = bot.entity.position.floored()

  for (let dx = -maxDistance; dx <= maxDistance; dx += 1) {
    for (let dz = -maxDistance; dz <= maxDistance; dz += 1) {
      const pos = base.offset(dx, -1, dz)
      const top = pos.offset(0, 1, 0)
      const ground = bot.blockAt(pos)
      const air = bot.blockAt(top)

      if (!ground || !air) continue
      if (air.name !== 'air' && air.name !== 'cave_air' && air.name !== 'void_air') continue
      if (ground.name === 'air' || ground.name === 'cave_air' || ground.name === 'void_air') continue

      return { ground, placePos: top }
    }
  }

  return null
}

async function placeCraftingTable(bot) {
  const tableItem = getItemByName(bot, 'crafting_table')
  if (!tableItem) {
    throw new Error('No crafting table in inventory')
  }

  const found = findNearbyPlacePosition(bot, 4)
  if (!found) {
    throw new Error('Could not find a nearby place position for crafting table')
  }

  await bot.equip(tableItem, 'hand')
  await bot.lookAt(found.ground.position.offset(0.5, 1, 0.5), true)
  await bot.placeBlock(found.ground, { x: 0, y: 1, z: 0 })
  await sleep(500)

  const placed = bot.blockAt(found.placePos)
  if (!placed || placed.name !== 'crafting_table') {
    throw new Error('Crafting table placement failed')
  }

  return placed
}

async function gatherLogsUntil(bot, targetLogCount, shouldCancel, announce) {
  while (getItemCount(bot, 'oak_log') +
         getItemCount(bot, 'spruce_log') +
         getItemCount(bot, 'birch_log') +
         getItemCount(bot, 'jungle_log') +
         getItemCount(bot, 'acacia_log') +
         getItemCount(bot, 'dark_oak_log') +
         getItemCount(bot, 'mangrove_log') +
         getItemCount(bot, 'cherry_log') +
         getItemCount(bot, 'crimson_stem') +
         getItemCount(bot, 'warped_stem') < targetLogCount) {
    if (shouldCancel()) {
      return { success: false, reason: 'canceled' }
    }

    if (announce) {
      bot.chat('Getting wood by hand.')
    }

    const result = await cutTree(bot, {
      shouldCancel,
      autoHarvest: true,
      announce: false,
      settleDelayMs: 900
    })

    if (result.canceled) {
      return { success: false, reason: 'canceled' }
    }

    if ((result.cutCount || 0) === 0) {
      return { success: false, reason: 'no_tree_found_or_not_cuttable' }
    }

    await sleep(500)
  }

  return { success: true, reason: 'ok' }
}

function getAnyLogCount(bot) {
  const logNames = [
    'oak_log',
    'spruce_log',
    'birch_log',
    'jungle_log',
    'acacia_log',
    'dark_oak_log',
    'mangrove_log',
    'cherry_log',
    'crimson_stem',
    'warped_stem'
  ]

  return logNames.reduce((sum, name) => sum + getItemCount(bot, name), 0)
}

function getFirstAvailableLogName(bot) {
  const logNames = [
    'oak_log',
    'spruce_log',
    'birch_log',
    'jungle_log',
    'acacia_log',
    'dark_oak_log',
    'mangrove_log',
    'cherry_log',
    'crimson_stem',
    'warped_stem'
  ]

  for (const name of logNames) {
    if (getItemCount(bot, name) > 0) {
      return name
    }
  }

  return null
}

async function ensurePlanks(bot, minPlanks, announce) {
  while (getItemCount(bot, 'oak_planks') +
         getItemCount(bot, 'spruce_planks') +
         getItemCount(bot, 'birch_planks') +
         getItemCount(bot, 'jungle_planks') +
         getItemCount(bot, 'acacia_planks') +
         getItemCount(bot, 'dark_oak_planks') +
         getItemCount(bot, 'mangrove_planks') +
         getItemCount(bot, 'cherry_planks') +
         getItemCount(bot, 'crimson_planks') +
         getItemCount(bot, 'warped_planks') < minPlanks) {
    const logName = getFirstAvailableLogName(bot)
    if (!logName) {
      throw new Error('No logs available to craft planks')
    }

    if (announce) {
      bot.chat(`Crafting planks from ${logName}.`)
    }

    await craftItem(bot, logName.replace('_log', '_planks').replace('_stem', '_planks'), 1, null)
    await sleep(300)
  }
}

function getAnyPlankName(bot) {
  const plankNames = [
    'oak_planks',
    'spruce_planks',
    'birch_planks',
    'jungle_planks',
    'acacia_planks',
    'dark_oak_planks',
    'mangrove_planks',
    'cherry_planks',
    'crimson_planks',
    'warped_planks'
  ]

  for (const name of plankNames) {
    if (getItemCount(bot, name) > 0) {
      return name
    }
  }

  return null
}

async function ensureSticks(bot, minSticks, announce) {
  while (getItemCount(bot, 'stick') < minSticks) {
    const plankName = getAnyPlankName(bot)
    if (!plankName) {
      throw new Error('No planks available to craft sticks')
    }

    if (announce) {
      bot.chat('Crafting sticks.')
    }

    await craftItem(bot, 'stick', 1, null)
    await sleep(300)
  }
}

async function ensureCraftingTable(bot, announce) {
  if (hasItem(bot, 'crafting_table')) {
    return
  }

  const plankName = getAnyPlankName(bot)
  if (!plankName) {
    throw new Error('No planks available for crafting table')
  }

  if (announce) {
    bot.chat('Crafting crafting table.')
  }

  await craftItem(bot, 'crafting_table', 1, null)
  await sleep(300)
}

async function moveNearBlock(bot, block) {
  const goal = new goals.GoalNear(
    Math.floor(block.position.x),
    Math.floor(block.position.y),
    Math.floor(block.position.z),
    2
  )

  await bot.pathfinder.goto(goal)
}

async function bootstrapFirstTool(bot, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false)
  const announce = options.announce !== false
  const preferredTool = options.preferredTool || 'wooden_axe'

  if (shouldCancel()) {
    if (announce) {
      bot.chat('Bootstrap canceled.')
    }

    return {
      success: false,
      canceled: true,
      craftedTool: null,
      reason: 'canceled'
    }
  }

  if (hasItem(bot, preferredTool)) {
    if (announce) {
      bot.chat(`I already have a ${preferredTool}.`)
    }

    return {
      success: true,
      canceled: false,
      craftedTool: preferredTool,
      reason: 'already_have_tool'
    }
  }

  const desiredLogCount = 2

  if (getAnyLogCount(bot) < desiredLogCount) {
    const gatherResult = await gatherLogsUntil(bot, desiredLogCount, shouldCancel, announce)
    if (!gatherResult.success) {
      if (announce) {
        bot.chat('I could not gather enough wood to start crafting.')
      }

      return {
        success: false,
        canceled: gatherResult.reason === 'canceled',
        craftedTool: null,
        reason: gatherResult.reason
      }
    }
  }

  if (shouldCancel()) {
    return {
      success: false,
      canceled: true,
      craftedTool: null,
      reason: 'canceled'
    }
  }

  await ensurePlanks(bot, 6, announce)
  await ensureSticks(bot, 2, announce)
  await ensureCraftingTable(bot, announce)

  if (shouldCancel()) {
    return {
      success: false,
      canceled: true,
      craftedTool: null,
      reason: 'canceled'
    }
  }

  if (announce) {
    bot.chat('Placing crafting table.')
  }

  const tableBlock = await placeCraftingTable(bot)
  await moveNearBlock(bot, tableBlock)
  await sleep(300)

  if (announce) {
    bot.chat(`Crafting ${preferredTool}.`)
  }

  await craftItem(bot, preferredTool, 1, tableBlock)
  await sleep(300)

  try {
    const tool = getItemByName(bot, preferredTool)
    if (tool) {
      await bot.equip(tool, 'hand')
    }
  } catch (err) {
    console.log('Could not equip first tool:', err.message)
  }

  try {
    await collectNearbyDrops(bot, {
      shouldCancel,
      silentNoDrops: true,
      announce: false
    })
  } catch (err) {
    console.log('Final collect failed:', err.message)
  }

  if (!hasItem(bot, preferredTool)) {
    if (announce) {
      bot.chat(`I finished the bootstrap steps, but I do not see the ${preferredTool} in my inventory.`)
    }

    return {
      success: false,
      canceled: false,
      craftedTool: null,
      reason: 'tool_not_found_after_craft'
    }
  }

  if (announce) {
    bot.chat(`Bootstrap complete. I made my first tool: ${preferredTool}.`)
  }

  return {
    success: true,
    canceled: false,
    craftedTool: preferredTool,
    reason: 'completed'
  }
}

module.exports = {
  bootstrapFirstTool
}
```

## actions/collectDrops.js

```js
const { goals } = require('mineflayer-pathfinder')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function distanceToBot(bot, entity) {
  return bot.entity.position.distanceTo(entity.position)
}

function getNearbyDropEntities(bot, maxDistance = 12) {
  const entities = Object.values(bot.entities)

  return entities
    .filter(entity => {
      if (!entity) return false
      if (!entity.position) return false
      if (entity.name !== 'item') return false
      return distanceToBot(bot, entity) <= maxDistance
    })
    .sort((a, b) => distanceToBot(bot, a) - distanceToBot(bot, b))
}

async function moveNearEntity(bot, entity, shouldCancel) {
  if (!entity || !entity.position) return false
  if (shouldCancel && shouldCancel()) return false

  const goal = new goals.GoalNear(
    Math.floor(entity.position.x),
    Math.floor(entity.position.y),
    Math.floor(entity.position.z),
    1
  )

  await bot.pathfinder.goto(goal)

  if (shouldCancel && shouldCancel()) return false
  return true
}

async function collectNearbyDrops(bot, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false)
  const silentNoDrops = options.silentNoDrops || false
  const maxDistance = options.maxDistance || 12
  const maxTargets = options.maxTargets || 20
  const announce = options.announce !== false

  if (shouldCancel()) {
    if (announce) {
      bot.chat('Item collection canceled.')
    }
    return { visitedCount: 0, canceled: true }
  }

  let visitedCount = 0

  if (!silentNoDrops && announce) {
    bot.chat('Looking for nearby drops.')
  }

  while (visitedCount < maxTargets) {
    if (shouldCancel()) {
      if (announce) {
        bot.chat(`Stopped collecting. Visited ${visitedCount} drop(s).`)
      }
      return { visitedCount, canceled: true }
    }

    const drops = getNearbyDropEntities(bot, maxDistance)
    const target = drops[0]

    if (!target) {
      if (!silentNoDrops && visitedCount === 0 && announce) {
        bot.chat('I do not see any nearby dropped items.')
      } else if (visitedCount > 0 && announce) {
        bot.chat(`Collection complete. Visited ${visitedCount} drop(s).`)
      }

      return { visitedCount, canceled: false }
    }

    try {
      const moved = await moveNearEntity(bot, target, shouldCancel)
      if (!moved) {
        if (announce) {
          bot.chat(`Stopped collecting. Visited ${visitedCount} drop(s).`)
        }
        return { visitedCount, canceled: true }
      }

      visitedCount += 1
      await sleep(450)
    } catch (err) {
      console.log('Collect move failed:', err.message)
      break
    }
  }

  if (visitedCount > 0 && announce) {
    bot.chat(`Collection complete. Visited ${visitedCount} drop(s).`)
  } else if (!silentNoDrops && announce) {
    bot.chat('I could not collect the nearby items.')
  }

  return { visitedCount, canceled: false }
}

module.exports = {
  collectNearbyDrops
}
```

## actions/cutTree.js

```js
const { goals } = require('mineflayer-pathfinder')
const { collectNearbyDrops } = require('./collectDrops')

const LOG_NAMES = new Set([
  'oak_log',
  'spruce_log',
  'birch_log',
  'jungle_log',
  'acacia_log',
  'dark_oak_log',
  'mangrove_log',
  'cherry_log',
  'crimson_stem',
  'warped_stem'
])

const LEAF_NAMES = new Set([
  'oak_leaves',
  'spruce_leaves',
  'birch_leaves',
  'jungle_leaves',
  'acacia_leaves',
  'dark_oak_leaves',
  'mangrove_leaves',
  'cherry_leaves',
  'azalea_leaves',
  'flowering_azalea_leaves',
  'nether_wart_block',
  'warped_wart_block'
])

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isLogBlock(block) {
  return !!block && LOG_NAMES.has(block.name)
}

function isLeafBlock(block) {
  return !!block && LEAF_NAMES.has(block.name)
}

function getBlockAtPosition(bot, position) {
  return bot.blockAt(position)
}

function isAirLike(block) {
  if (!block) return true
  return block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air'
}

function isPassableForStanding(block) {
  return isAirLike(block)
}

function isSolidGround(block) {
  if (!block) return false
  return !isAirLike(block) && !isLeafBlock(block)
}

function isStandable(bot, position) {
  const feetBlock = bot.blockAt(position)
  const headBlock = bot.blockAt(position.offset(0, 1, 0))
  const belowBlock = bot.blockAt(position.offset(0, -1, 0))

  if (!isPassableForStanding(feetBlock)) return false
  if (!isPassableForStanding(headBlock)) return false
  if (!isSolidGround(belowBlock)) return false

  return true
}

async function waitForBlockToChange(bot, position, timeoutMs = 4000, intervalMs = 150) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const current = getBlockAtPosition(bot, position)
    if (!isLogBlock(current) && !isLeafBlock(current)) {
      return true
    }

    await sleep(intervalMs)
  }

  return false
}

async function waitForLogToChange(bot, position, timeoutMs = 4000, intervalMs = 150) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const current = getBlockAtPosition(bot, position)
    if (!isLogBlock(current)) {
      return true
    }

    await sleep(intervalMs)
  }

  return false
}

async function safeGoto(bot, goal) {
  try {
    await bot.pathfinder.goto(goal)
    return { success: true, reason: 'ok' }
  } catch (err) {
    return {
      success: false,
      reason: err?.message || 'goto_failed'
    }
  }
}

async function equipBestTool(bot, block) {
  try {
    const tool = bot.pathfinder.bestHarvestTool(block)
    if (tool) {
      await bot.equip(tool, 'hand')
    }
  } catch (err) {
    console.log('Could not equip tool:', err.message)
  }
}

async function digSpecificBlock(bot, block, shouldCancel) {
  if (!block) return { success: false, reason: 'no_block' }
  if (!block.diggable) return { success: false, reason: 'not_diggable' }
  if (shouldCancel && shouldCancel()) return { success: false, reason: 'canceled' }

  await equipBestTool(bot, block)

  try {
    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true)
  } catch (err) {
    console.log('LookAt failed:', err.message)
  }

  if (typeof bot.canDigBlock === 'function') {
    try {
      if (!bot.canDigBlock(block)) {
        return { success: false, reason: 'cannot_dig_from_here' }
      }
    } catch (err) {
      console.log('canDigBlock check failed:', err.message)
    }
  }

  try {
    await bot.dig(block, true)
  } catch (err) {
    return {
      success: false,
      reason: `dig_error:${err.message}`
    }
  }

  return { success: true, reason: 'dug' }
}

function getStandPositionsAround(block) {
  const p = block.position
  const positions = []

  for (const y of [0, 1]) {
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        if (dx === 0 && dz === 0) continue

        const manhattan = Math.abs(dx) + Math.abs(dz)
        if (manhattan > 3) continue

        positions.push(p.offset(dx, y, dz))
      }
    }
  }

  return positions
}

function getNearbyLeafObstructions(bot, targetBlock, maxDistance = 2) {
  const results = []

  for (let dx = -maxDistance; dx <= maxDistance; dx += 1) {
    for (let dy = 0; dy <= 2; dy += 1) {
      for (let dz = -maxDistance; dz <= maxDistance; dz += 1) {
        const pos = targetBlock.position.offset(dx, dy, dz)
        const block = bot.blockAt(pos)
        if (!isLeafBlock(block)) continue

        results.push(block)
      }
    }
  }

  return results.sort((a, b) => {
    const da = bot.entity.position.distanceTo(a.position)
    const db = bot.entity.position.distanceTo(b.position)
    return da - db
  })
}

async function trimNearbyLeaves(bot, targetBlock, shouldCancel, maxLeaves = 4) {
  const obstructions = getNearbyLeafObstructions(bot, targetBlock, 2)
  let removed = 0

  for (const leaf of obstructions) {
    if (removed >= maxLeaves) break
    if (shouldCancel && shouldCancel()) {
      return { removed, canceled: true }
    }

    const dist = bot.entity.position.distanceTo(leaf.position)
    if (dist > 5.5) continue

    const freshLeaf = bot.blockAt(leaf.position)
    if (!isLeafBlock(freshLeaf)) continue
    if (!freshLeaf.diggable) continue

    const result = await digSpecificBlock(bot, freshLeaf, shouldCancel)
    if (result.success) {
      removed += 1
      await waitForBlockToChange(bot, freshLeaf.position, 2000, 120)
      await sleep(120)
    }
  }

  return { removed, canceled: false }
}

async function moveNearBlock(bot, block, shouldCancel) {
  if (!block || !block.position) {
    return { success: false, reason: 'no_block' }
  }

  if (shouldCancel && shouldCancel()) {
    return { success: false, reason: 'canceled' }
  }

  const standPositions = getStandPositionsAround(block)
    .filter(pos => isStandable(bot, pos))
    .sort((a, b) => {
      const byBot = bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b)
      if (byBot !== 0) return byBot
      return a.distanceTo(block.position) - b.distanceTo(block.position)
    })

  for (const standPos of standPositions) {
    if (shouldCancel && shouldCancel()) {
      return { success: false, reason: 'canceled' }
    }

    const goal = new goals.GoalNear(
      Math.floor(standPos.x),
      Math.floor(standPos.y),
      Math.floor(standPos.z),
      0
    )

    const gotoResult = await safeGoto(bot, goal)
    if (!gotoResult.success) {
      continue
    }

    const freshBlock = getBlockAtPosition(bot, block.position)
    if (!freshBlock) {
      return { success: true, reason: 'already_gone' }
    }

    const dist = bot.entity.position.distanceTo(freshBlock.position)
    if (dist <= 5.5) {
      return { success: true, reason: 'ok' }
    }
  }

  const fallbackGoal = new goals.GoalNear(
    Math.floor(block.position.x),
    Math.floor(block.position.y),
    Math.floor(block.position.z),
    3
  )

  const fallback = await safeGoto(bot, fallbackGoal)
  if (!fallback.success) {
    return { success: false, reason: `move_failed:${fallback.reason}` }
  }

  const freshBlock = getBlockAtPosition(bot, block.position)
  if (!freshBlock) {
    return { success: true, reason: 'already_gone' }
  }

  const dist = bot.entity.position.distanceTo(freshBlock.position)
  if (dist > 5.5) {
    return { success: false, reason: 'too_far_after_move' }
  }

  return { success: true, reason: 'ok' }
}

async function digLogBlock(bot, block, shouldCancel) {
  if (!block) return { success: false, reason: 'no_block' }
  if (!block.diggable) return { success: false, reason: 'not_diggable' }
  if (shouldCancel && shouldCancel()) return { success: false, reason: 'canceled' }

  const moveResult = await moveNearBlock(bot, block, shouldCancel)
  if (!moveResult.success) {
    return { success: false, reason: moveResult.reason }
  }

  let freshBlock = getBlockAtPosition(bot, block.position)

  if (!freshBlock) {
    return { success: true, reason: 'already_gone' }
  }

  if (!isLogBlock(freshBlock)) {
    return { success: true, reason: 'already_changed' }
  }

  if (!freshBlock.diggable) {
    return { success: false, reason: 'fresh_not_diggable' }
  }

  if (typeof bot.canDigBlock === 'function') {
    try {
      if (!bot.canDigBlock(freshBlock)) {
        const trimResult = await trimNearbyLeaves(bot, freshBlock, shouldCancel, 4)

        if (trimResult.canceled) {
          return { success: false, reason: 'canceled' }
        }

        freshBlock = getBlockAtPosition(bot, block.position)

        if (!freshBlock || !isLogBlock(freshBlock)) {
          return { success: true, reason: 'already_changed_after_trim' }
        }

        if (!bot.canDigBlock(freshBlock)) {
          return { success: false, reason: 'cannot_dig_from_here_after_trim' }
        }
      }
    } catch (err) {
      console.log('canDigBlock check failed:', err.message)
    }
  }

  const digResult = await digSpecificBlock(bot, freshBlock, shouldCancel)
  if (!digResult.success) {
    return digResult
  }

  const changed = await waitForLogToChange(bot, freshBlock.position, 3500, 150)
  if (!changed) {
    const after = getBlockAtPosition(bot, freshBlock.position)
    if (after && isLogBlock(after)) {
      return { success: false, reason: 'block_still_exists_after_dig' }
    }
  }

  return { success: true, reason: 'dug' }
}

function isAirLike(block) {
  if (!block) return true
  return block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air'
}

function isExposedLog(bot, block) {
  if (!isLogBlock(block)) return false

  const above = bot.blockAt(block.position.offset(0, 1, 0))
  const north = bot.blockAt(block.position.offset(0, 0, -1))
  const south = bot.blockAt(block.position.offset(0, 0, 1))
  const east = bot.blockAt(block.position.offset(1, 0, 0))
  const west = bot.blockAt(block.position.offset(-1, 0, 0))

  const sideOpen =
    isAirLike(north) ||
    isAirLike(south) ||
    isAirLike(east) ||
    isAirLike(west)

  const topOpen = isAirLike(above) || isLeafBlock(above)

  return sideOpen || topOpen
}

function findNearbyLog(bot) {
  const matches = bot.findBlocks({
    matching: block => isLogBlock(block),
    maxDistance: 24,
    count: 30
  })

  const candidates = matches
    .map(position => bot.blockAt(position))
    .filter(block => isLogBlock(block))
    .filter(block => isExposedLog(bot, block))
    .sort((a, b) => {
      const da = bot.entity.position.distanceTo(a.position)
      const db = bot.entity.position.distanceTo(b.position)
      return da - db
    })

  return candidates[0] || null
}

function getConnectedLogs(bot, firstBlock, maxBlocks = 48) {
  const visited = new Set()
  const queue = [firstBlock]
  const results = []

  while (queue.length > 0 && results.length < maxBlocks) {
    const current = queue.shift()
    if (!current) continue

    const key = current.position.toString()
    if (visited.has(key)) continue
    visited.add(key)

    const fresh = bot.blockAt(current.position)
    if (!isLogBlock(fresh)) continue

    results.push(fresh)

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          if (dx === 0 && dy === 0 && dz === 0) continue

          const neighbor = bot.blockAt(current.position.offset(dx, dy, dz))
          if (isLogBlock(neighbor)) {
            queue.push(neighbor)
          }
        }
      }
    }
  }

  return results
}

function chooseNextLog(bot, logs) {
  return logs
    .filter(log => isLogBlock(bot.blockAt(log.position)))
    .sort((a, b) => {
      const da = bot.entity.position.distanceTo(a.position)
      const db = bot.entity.position.distanceTo(b.position)

      if (da !== db) return da - db

      return a.position.y - b.position.y
    })[0] || null
}

async function cutSingleLogWithRetries(bot, log, shouldCancel, announce) {
  const maxAttempts = 3
  let lastReason = 'unknown'

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (shouldCancel && shouldCancel()) {
      return { success: false, canceled: true, reason: 'canceled' }
    }

    const freshBlock = getBlockAtPosition(bot, log.position)

    if (!freshBlock || !isLogBlock(freshBlock)) {
      return { success: true, canceled: false, reason: 'already_gone' }
    }

    const result = await digLogBlock(bot, freshBlock, shouldCancel)
    lastReason = result.reason

    if (result.success) {
      return { success: true, canceled: false, reason: result.reason }
    }

    if (announce) {
      bot.chat(`Log dig attempt ${attempt} failed: ${result.reason}`)
    }

    await sleep(250)
  }

  return { success: false, canceled: false, reason: lastReason }
}

async function cutTree(bot, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false)
  const autoHarvest = options.autoHarvest !== false
  const settleDelayMs = options.settleDelayMs ?? 1200
  const announce = options.announce !== false

  if (shouldCancel()) {
    if (announce) {
      bot.chat('Tree cutting canceled.')
    }

    return {
      cutCount: 0,
      collectedCount: 0,
      canceled: true
    }
  }

  const firstLog = findNearbyLog(bot)

  if (!firstLog) {
    if (announce) {
      bot.chat('I do not see a tree nearby.')
    }

    return {
      cutCount: 0,
      collectedCount: 0,
      canceled: false
    }
  }

  if (announce) {
    bot.chat(`I found a ${firstLog.name}. Cutting tree.`)
  }

  let cutCount = 0
  let stuckCount = 0

  while (stuckCount < 8) {
    if (shouldCancel()) {
      if (announce) {
        bot.chat(`Stopped tree cutting. Removed ${cutCount} log block(s).`)
      }

      return {
        cutCount,
        collectedCount: 0,
        canceled: true
      }
    }

    const logs = getConnectedLogs(bot, firstLog)
    const nextLog = chooseNextLog(bot, logs)

    if (!nextLog) {
      break
    }

    const result = await cutSingleLogWithRetries(bot, nextLog, shouldCancel, announce)

    if (result.canceled) {
      if (announce) {
        bot.chat(`Stopped tree cutting. Removed ${cutCount} log block(s).`)
      }

      return {
        cutCount,
        collectedCount: 0,
        canceled: true
      }
    }

    const after = getBlockAtPosition(bot, nextLog.position)
    if (!isLogBlock(after)) {
      cutCount += 1
      stuckCount = 0
    } else {
      stuckCount += 1

      if (announce) {
        bot.chat(`Skipping stuck log at ${nextLog.position}. Reason: ${result.reason}`)
      }
    }

    await sleep(150)
  }

  if (cutCount === 0) {
    if (announce) {
      bot.chat('I could not cut the tree.')
    }

    return {
      cutCount: 0,
      collectedCount: 0,
      canceled: false
    }
  }

  if (!autoHarvest) {
    if (announce) {
      bot.chat(`Tree cut complete. Removed ${cutCount} log block(s).`)
    }

    return {
      cutCount,
      collectedCount: 0,
      canceled: false
    }
  }

  if (shouldCancel()) {
    if (announce) {
      bot.chat(`Stopped tree cutting. Removed ${cutCount} log block(s).`)
    }

    return {
      cutCount,
      collectedCount: 0,
      canceled: true
    }
  }

  if (announce) {
    bot.chat(`Tree cut complete. Removed ${cutCount} log block(s). Harvesting drops.`)
  }

  if (settleDelayMs > 0) {
    await sleep(settleDelayMs)
  }

  if (shouldCancel()) {
    if (announce) {
      bot.chat(`Stopped after cutting. Removed ${cutCount} log block(s).`)
    }

    return {
      cutCount,
      collectedCount: 0,
      canceled: true
    }
  }

  try {
    const collectResult = await collectNearbyDrops(bot, {
      shouldCancel,
      silentNoDrops: true,
      announce
    })

    const collectedCount = collectResult?.visitedCount || 0
    const canceled = !!collectResult?.canceled

    if (canceled) {
      if (announce) {
        bot.chat(
          `Stopped harvesting. Removed ${cutCount} log block(s), visited ${collectedCount} drop(s).`
        )
      }

      return {
        cutCount,
        collectedCount,
        canceled: true
      }
    }

    if (announce) {
      if (collectedCount > 0) {
        bot.chat(
          `Tree harvest complete. Removed ${cutCount} log block(s), visited ${collectedCount} drop(s).`
        )
      } else {
        bot.chat(`Tree harvest complete. Removed ${cutCount} log block(s).`)
      }
    }

    return {
      cutCount,
      collectedCount,
      canceled: false
    }
  } catch (err) {
    console.log('Harvest failed:', err.message)

    if (announce) {
      bot.chat(`Tree cut complete. Removed ${cutCount} log block(s), but harvest failed.`)
    }

    return {
      cutCount,
      collectedCount: 0,
      canceled: false
    }
  }
}

module.exports = {
  cutTree
}
```

## actions/fightHostiles.js

```js
const { goals } = require('mineflayer-pathfinder')

const HOSTILE_NAMES = new Set([
  'zombie',
  'skeleton'
])

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function distance(a, b) {
  return a.position.distanceTo(b.position)
}

function getNearbyHostiles(bot, maxDistance = 16) {
  return Object.values(bot.entities)
    .filter(entity => {
      if (!entity) return false
      if (!entity.position) return false
      if (!entity.name) return false
      if (!HOSTILE_NAMES.has(entity.name)) return false
      return distance(bot.entity, entity) <= maxDistance
    })
    .sort((a, b) => distance(bot.entity, a) - distance(bot.entity, b))
}

function getNearestHostile(bot, maxDistance = 16) {
  return getNearbyHostiles(bot, maxDistance)[0] || null
}

function getPlayerEntity(bot, playerName) {
  const player = bot.players[playerName]
  if (!player) return null
  return player.entity || null
}

function getNearestHostileNearPlayer(bot, playerName, maxDistanceFromPlayer = 12) {
  const playerEntity = getPlayerEntity(bot, playerName)
  if (!playerEntity) return null

  return (
    Object.values(bot.entities)
      .filter(entity => {
        if (!entity) return false
        if (!entity.position) return false
        if (!entity.name) return false
        if (!HOSTILE_NAMES.has(entity.name)) return false
        return playerEntity.position.distanceTo(entity.position) <= maxDistanceFromPlayer
      })
      .sort(
        (a, b) =>
          playerEntity.position.distanceTo(a.position) -
          playerEntity.position.distanceTo(b.position)
      )[0] || null
  )
}

async function equipBestWeapon(bot) {
  const weaponNames = [
    'netherite_sword',
    'diamond_sword',
    'iron_sword',
    'stone_sword',
    'golden_sword',
    'wooden_sword',
    'netherite_axe',
    'diamond_axe',
    'iron_axe',
    'stone_axe',
    'golden_axe',
    'wooden_axe'
  ]

  const items = bot.inventory.items()

  for (const weaponName of weaponNames) {
    const weapon = items.find(item => item.name === weaponName)
    if (weapon) {
      try {
        await bot.equip(weapon, 'hand')
        return true
      } catch (err) {
        console.log('Could not equip weapon:', err.message)
        return false
      }
    }
  }

  return false
}

async function moveNearEntity(bot, entity, range = 2, shouldCancel = () => false) {
  if (!entity || !entity.position) return false
  if (shouldCancel()) return false

  const goal = new goals.GoalNear(
    Math.floor(entity.position.x),
    Math.floor(entity.position.y),
    Math.floor(entity.position.z),
    range
  )

  await bot.pathfinder.goto(goal)

  if (shouldCancel()) return false
  return true
}

async function attackEntity(bot, entity, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false)
  const maxChaseDistance = options.maxChaseDistance || 20
  const attackRange = options.attackRange || 3
  const maxFightTimeMs = options.maxFightTimeMs || 20000
  const announce = options.announce !== false

  if (!entity) {
    if (announce) {
      bot.chat('I do not see a hostile mob nearby.')
    }

    return { defeated: false, canceled: false }
  }

  await equipBestWeapon(bot)

  const startedAt = Date.now()
  const firstName = entity.name

  if (announce) {
    bot.chat(`Attacking ${firstName}.`)
  }

  while (true) {
    if (shouldCancel()) {
      if (announce) {
        bot.chat('Attack canceled.')
      }

      return { defeated: false, canceled: true }
    }

    const current = bot.entities[entity.id]
    if (!current) {
      if (announce) {
        bot.chat(`${firstName} defeated.`)
      }

      return { defeated: true, canceled: false }
    }

    const dist = distance(bot.entity, current)

    if (dist > maxChaseDistance) {
      if (announce) {
        bot.chat(`I lost the ${firstName}.`)
      }

      return { defeated: false, canceled: false }
    }

    if (Date.now() - startedAt > maxFightTimeMs) {
      if (announce) {
        bot.chat(`I could not finish the ${firstName}.`)
      }

      return { defeated: false, canceled: false }
    }

    if (dist > attackRange) {
      try {
        await moveNearEntity(bot, current, 2, shouldCancel)
      } catch (err) {
        console.log('Move to hostile failed:', err.message)
      }
    } else {
      try {
        await bot.lookAt(current.position.offset(0, current.height, 0), true)
      } catch (err) {
        console.log('LookAt failed:', err.message)
      }

      try {
        bot.attack(current)
      } catch (err) {
        console.log('Attack failed:', err.message)
      }

      await sleep(650)
    }

    await sleep(100)
  }
}

async function fightNearestHostile(bot, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false)
  const maxDistance = options.maxDistance || 16

  const hostile = getNearestHostile(bot, maxDistance)

  if (!hostile) {
    bot.chat('I do not see any nearby zombies or skeletons.')
    return { defeated: false, canceled: false }
  }

  return attackEntity(bot, hostile, { shouldCancel, announce: true })
}

module.exports = {
  fightNearestHostile,
  getNearestHostile,
  getNearestHostileNearPlayer,
  attackEntity
}
```

## actions/followPlayer.js

```js
const { goals } = require('mineflayer-pathfinder')
const { getNearestHostileNearPlayer, attackEntity } = require('./fightHostiles')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getPlayerEntity(bot, playerName) {
  const player = bot.players[playerName]
  if (!player) return null
  return player.entity || null
}

async function followPlayer(bot, playerName, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false)
  const followDistance = options.followDistance || 2
  const updateIntervalMs = options.updateIntervalMs || 500
  const autoFight = options.autoFight !== false
  const combatScanRange = options.combatScanRange || 10
  const announceCombat = options.announceCombat !== false

  const playerEntity = getPlayerEntity(bot, playerName)

  if (!playerEntity) {
    bot.chat(`I can't find ${playerName}.`)
    return { canceled: false }
  }

  bot.chat(`Following you, ${playerName}. Say "bot stop" when done.`)

  let lastGoalKey = ''

  while (true) {
    if (shouldCancel()) {
      bot.chat('Follow stopped.')
      return { canceled: true }
    }

    const targetEntity = getPlayerEntity(bot, playerName)

    if (!targetEntity) {
      bot.chat(`I lost track of ${playerName}.`)
      return { canceled: false }
    }

    if (autoFight) {
      const hostile = getNearestHostileNearPlayer(bot, playerName, combatScanRange)

      if (hostile) {
        if (announceCombat) {
          bot.chat(`Hostile spotted: ${hostile.name}.`)
        }

        await attackEntity(bot, hostile, {
          shouldCancel,
          maxFightTimeMs: 15000,
          announce: false
        })

        if (shouldCancel()) {
          bot.chat('Follow stopped.')
          return { canceled: true }
        }
      }
    }

    const pos = targetEntity.position
    const goalX = Math.floor(pos.x)
    const goalY = Math.floor(pos.y)
    const goalZ = Math.floor(pos.z)
    const goalKey = `${goalX}:${goalY}:${goalZ}:${followDistance}`

    if (goalKey !== lastGoalKey) {
      const goal = new goals.GoalNear(goalX, goalY, goalZ, followDistance)
      bot.pathfinder.setGoal(goal, true)
      lastGoalKey = goalKey
    }

    await sleep(updateIntervalMs)
  }
}

module.exports = {
  followPlayer
}
```

## actions/harvestNearby.js

```js
const { collectNearbyDrops } = require('./collectDrops')

const DEFAULT_BLOCK_NAMES = [
  'oak_log',
  'spruce_log',
  'birch_log',
  'jungle_log',
  'acacia_log',
  'dark_oak_log',
  'mangrove_log',
  'cherry_log',
  'crimson_stem',
  'warped_stem',
  'oak_leaves',
  'spruce_leaves',
  'birch_leaves',
  'jungle_leaves',
  'acacia_leaves',
  'dark_oak_leaves',
  'mangrove_leaves',
  'cherry_leaves',
  'azalea_leaves',
  'flowering_azalea_leaves',
  'nether_wart_block',
  'warped_wart_block',
  'dirt',
  'coarse_dirt',
  'rooted_dirt',
  'grass_block',
  'sand',
  'red_sand',
  'gravel',
  'stone',
  'cobblestone',
  'deepslate',
  'cobbled_deepslate'
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isAirLike(block) {
  if (!block) return true
  return block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air'
}

function isExposedBlock(bot, block) {
  if (!block) return false

  const neighbors = [
    block.position.offset(1, 0, 0),
    block.position.offset(-1, 0, 0),
    block.position.offset(0, 1, 0),
    block.position.offset(0, -1, 0),
    block.position.offset(0, 0, 1),
    block.position.offset(0, 0, -1)
  ]

  return neighbors.some(pos => {
    const neighbor = bot.blockAt(pos)
    return isAirLike(neighbor)
  })
}

function isBelowBotFeet(bot, block) {
  if (!block) return false
  const botFeetY = Math.floor(bot.entity.position.y)
  return block.position.y < botFeetY
}

function isSameColumnAsBot(bot, block) {
  if (!block) return false

  const botX = Math.floor(bot.entity.position.x)
  const botY = Math.floor(bot.entity.position.y)
  const botZ = Math.floor(bot.entity.position.z)

  return (
    block.position.x === botX &&
    block.position.z === botZ &&
    (block.position.y === botY || block.position.y === botY - 1)
  )
}

function isUnsafeToDig(bot, block) {
  if (!block) return true
  if (isBelowBotFeet(bot, block)) return true
  if (isSameColumnAsBot(bot, block)) return true
  if (!isExposedBlock(bot, block)) return true
  return false
}

function canStandAt(bot, position) {
  const feet = bot.blockAt(position)
  const head = bot.blockAt(position.offset(0, 1, 0))
  const below = bot.blockAt(position.offset(0, -1, 0))

  if (!isAirLike(feet)) return false
  if (!isAirLike(head)) return false
  if (!below || isAirLike(below)) return false

  return true
}

function getStandPositionsAround(block) {
  const p = block.position
  const results = []

  for (const y of [0, 1]) {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        if (dx === 0 && dz === 0) continue
        results.push(p.offset(dx, y, dz))
      }
    }
  }

  return results
}

async function equipBestTool(bot, block) {
  try {
    const tool = bot.pathfinder.bestHarvestTool(block)
    if (tool) {
      await bot.equip(tool, 'hand')
    }
  } catch (err) {
    console.log('Could not equip tool:', err.message)
  }
}

function getNearbyHarvestableBlocks(bot, options = {}) {
  const blockNames = new Set(options.blockNames || DEFAULT_BLOCK_NAMES)
  const maxDistance = options.maxDistance || 6

  const results = []

  for (let dx = -maxDistance; dx <= maxDistance; dx += 1) {
    for (let dy = 0; dy <= 3; dy += 1) {
      for (let dz = -maxDistance; dz <= maxDistance; dz += 1) {
        const pos = bot.entity.position.offset(dx, dy, dz).floored()
        const block = bot.blockAt(pos)

        if (!block) continue
        if (!blockNames.has(block.name)) continue
        if (!block.diggable) continue
        if (isUnsafeToDig(bot, block)) continue

        const dist = bot.entity.position.distanceTo(block.position)
        if (dist > maxDistance + 0.5) continue

        results.push(block)
      }
    }
  }

  return results
    .filter(block => {
      const current = bot.blockAt(block.position)
      return current && current.name === block.name
    })
    .sort((a, b) => {
      const da = bot.entity.position.distanceTo(a.position)
      const db = bot.entity.position.distanceTo(b.position)

      if (da !== db) return da - db
      return a.position.y - b.position.y
    })
}

function pickBestReachableBlock(bot, blocks) {
  for (const block of blocks) {
    const current = bot.blockAt(block.position)
    if (!current || current.name !== block.name) continue
    if (isUnsafeToDig(bot, current)) continue

    const dist = bot.entity.position.distanceTo(current.position)

    if (dist <= 4.8) {
      try {
        if (!bot.canDigBlock || bot.canDigBlock(current)) {
          return current
        }
      } catch (err) {
        console.log('canDigBlock failed:', err.message)
      }
    }

    const standPositions = getStandPositionsAround(current)
      .filter(pos => canStandAt(bot, pos))
      .sort((a, b) => {
        const da = bot.entity.position.distanceTo(a)
        const db = bot.entity.position.distanceTo(b)
        return da - db
      })

    if (standPositions.length > 0) {
      return current
    }
  }

  return null
}
```

## actions/mineMaterial.js

```js
const { goals } = require('mineflayer-pathfinder')
const { collectNearbyDrops } = require('./collectDrops')

const MATERIAL_DEFS = {
  stone: {
    displayName: 'stone',
    blockNames: ['stone', 'cobblestone', 'deepslate', 'cobbled_deepslate'],
    maxDistance: 28,
    maxBlocks: 8
  },
  coal: {
    displayName: 'coal',
    blockNames: ['coal_ore', 'deepslate_coal_ore'],
    maxDistance: 28,
    maxBlocks: 6
  },
  sand: {
    displayName: 'sand',
    blockNames: ['sand', 'red_sand'],
    maxDistance: 24,
    maxBlocks: 10
  },
  gravel: {
    displayName: 'gravel',
    blockNames: ['gravel'],
    maxDistance: 24,
    maxBlocks: 10
  },
  dirt: {
    displayName: 'dirt',
    blockNames: ['dirt', 'coarse_dirt', 'rooted_dirt'],
    maxDistance: 24,
    maxBlocks: 10
  },
  cobblestone: {
    displayName: 'cobblestone',
    blockNames: ['cobblestone', 'cobbled_deepslate'],
    maxDistance: 24,
    maxBlocks: 8
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getMaterialDef(materialName) {
  if (!materialName) return null
  return MATERIAL_DEFS[materialName.toLowerCase()] || null
}

function isMatchingBlock(block, materialDef) {
  return !!block && !!materialDef && materialDef.blockNames.includes(block.name)
}

function getBlockAtPosition(bot, position) {
  return bot.blockAt(position)
}

async function waitForBlockToChange(bot, position, materialDef, timeoutMs = 4000, intervalMs = 150) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const current = getBlockAtPosition(bot, position)
    if (!isMatchingBlock(current, materialDef)) {
      return true
    }

    await sleep(intervalMs)
  }

  return false
}

function getNearbyCandidateBlocks(bot, materialDef, maxDistance, limit = 12) {
  const matches = bot.findBlocks({
    matching: block => isMatchingBlock(block, materialDef),
    maxDistance,
    count: limit
  })

  return matches
    .map(position => bot.blockAt(position))
    .filter(block => isMatchingBlock(block, materialDef))
    .sort((a, b) => {
      const da = bot.entity.position.distanceTo(a.position)
      const db = bot.entity.position.distanceTo(b.position)
      return da - db
    })
}

async function safeGoto(bot, goal) {
  try {
    await bot.pathfinder.goto(goal)
    return { success: true, reason: 'ok' }
  } catch (err) {
    const message = err?.message || 'unknown_goto_error'
    return { success: false, reason: message }
  }
}

async function moveNearBlock(bot, block, shouldCancel) {
  if (!block || !block.position) {
    return { success: false, reason: 'no_block' }
  }

  if (shouldCancel && shouldCancel()) {
    return { success: false, reason: 'canceled' }
  }

  const goal = new goals.GoalNear(
    Math.floor(block.position.x),
    Math.floor(block.position.y),
    Math.floor(block.position.z),
    1
  )

  const gotoResult = await safeGoto(bot, goal)

  if (!gotoResult.success) {
    return {
      success: false,
      reason: `goto_failed:${gotoResult.reason}`
    }
  }

  if (shouldCancel && shouldCancel()) {
    return { success: false, reason: 'canceled' }
  }

  const freshBlock = getBlockAtPosition(bot, block.position)
  if (!freshBlock) {
    return { success: false, reason: 'block_missing_after_move' }
  }

  const dist = bot.entity.position.distanceTo(freshBlock.position)
  if (dist > 3.25) {
    return { success: false, reason: 'too_far_after_move' }
  }

  return { success: true, reason: 'ok' }
}

async function equipBestTool(bot, block) {
  try {
    const tool = bot.pathfinder.bestHarvestTool(block)
    if (tool) {
      await bot.equip(tool, 'hand')
    }
  } catch (err) {
    console.log('Could not equip tool:', err.message)
  }
}

async function digBlock(bot, block, materialDef, shouldCancel) {
  if (!block) return { success: false, reason: 'no_block' }
  if (!block.diggable) return { success: false, reason: 'not_diggable' }
  if (shouldCancel && shouldCancel()) return { success: false, reason: 'canceled' }

  const moveResult = await moveNearBlock(bot, block, shouldCancel)
  if (!moveResult.success) {
    return { success: false, reason: moveResult.reason }
  }

  const freshBlock = getBlockAtPosition(bot, block.position)

  if (!freshBlock) {
    return { success: true, reason: 'already_gone' }
  }

  if (!isMatchingBlock(freshBlock, materialDef)) {
    return { success: true, reason: 'already_changed' }
  }

  if (!freshBlock.diggable) {
    return { success: false, reason: 'fresh_not_diggable' }
  }

  await equipBestTool(bot, freshBlock)

  if (shouldCancel && shouldCancel()) {
    return { success: false, reason: 'canceled' }
  }

  try {
    await bot.lookAt(freshBlock.position.offset(0.5, 0.5, 0.5), true)
  } catch (err) {
    console.log('LookAt failed:', err.message)
  }

  if (typeof bot.canDigBlock === 'function') {
    try {
      if (!bot.canDigBlock(freshBlock)) {
        return { success: false, reason: 'cannot_dig_from_here' }
      }
    } catch (err) {
      console.log('canDigBlock check failed:', err.message)
    }
  }

  try {
    await bot.dig(freshBlock, true)
  } catch (err) {
    return {
      success: false,
      reason: `dig_error:${err.message}`
    }
  }

  const changed = await waitForBlockToChange(bot, freshBlock.position, materialDef, 3500, 150)

  if (!changed) {
    const after = getBlockAtPosition(bot, freshBlock.position)
    if (after && isMatchingBlock(after, materialDef)) {
      return { success: false, reason: 'block_still_exists_after_dig' }
    }
  }

  return { success: true, reason: 'dug' }
}

async function mineSingleBlockWithRetries(bot, block, materialDef, shouldCancel, announce) {
  const maxAttempts = 2
  let lastReason = 'unknown'

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (shouldCancel && shouldCancel()) {
      return { success: false, canceled: true, reason: 'canceled' }
    }

    const freshBlock = getBlockAtPosition(bot, block.position)

    if (!freshBlock || !isMatchingBlock(freshBlock, materialDef)) {
      return { success: true, canceled: false, reason: 'already_gone' }
    }

    const result = await digBlock(bot, freshBlock, materialDef, shouldCancel)
    lastReason = result.reason

    if (result.success) {
      return { success: true, canceled: false, reason: result.reason }
    }

    if (announce) {
      bot.chat(`${materialDef.displayName} dig attempt ${attempt} failed: ${result.reason}`)
    }

    await sleep(200)
  }

  return { success: false, canceled: false, reason: lastReason }
}

async function mineMaterial(bot, materialName, options = {}) {
  const materialDef = getMaterialDef(materialName)

  if (!materialDef) {
    const message = `Unknown material: ${materialName}.`

    if (options.announce !== false) {
      bot.chat(message)
    }

    return {
      minedCount: 0,
      collectedCount: 0,
      canceled: false,
      foundTarget: false,
      status: 'unknown_material',
      message,
      lastFailureReason: null
    }
  }

  const shouldCancel = options.shouldCancel || (() => false)
  const autoHarvest = options.autoHarvest !== false
  const announce = options.announce !== false
  const maxBlocks = options.maxBlocks || materialDef.maxBlocks
  const maxDistance = options.maxDistance || materialDef.maxDistance
  const settleDelayMs = options.settleDelayMs ?? 800

  if (shouldCancel()) {
    const message = `${materialDef.displayName} mining canceled.`

    if (announce) {
      bot.chat(message)
    }

    return {
      minedCount: 0,
      collectedCount: 0,
      canceled: true,
      foundTarget: false,
      status: 'canceled',
      message,
      lastFailureReason: null
    }
  }

  let minedCount = 0
  let foundTarget = false
  let lastFailureReason = null

  if (announce) {
    bot.chat(`Looking for ${materialDef.displayName}.`)
  }

  for (let i = 0; i < maxBlocks; i += 1) {
    if (shouldCancel()) {
      const message = `Stopped mining. Removed ${minedCount} ${materialDef.displayName} block(s).`

      if (announce) {
        bot.chat(message)
      }

      return {
        minedCount,
        collectedCount: 0,
        canceled: true,
        foundTarget,
        status: 'canceled',
        message,
        lastFailureReason
      }
    }

    const candidates = getNearbyCandidateBlocks(bot, materialDef, maxDistance, 10)

    if (candidates.length === 0) {
      const message =
        minedCount > 0
          ? `Mining complete. Removed ${minedCount} ${materialDef.displayName} block(s).`
          : `I do not see any nearby ${materialDef.displayName}.`

      if (announce) {
        bot.chat(message)
      }

      return {
        minedCount,
        collectedCount: 0,
        canceled: false,
        foundTarget,
        status: minedCount > 0 ? 'completed' : 'not_found',
        message,
        lastFailureReason
      }
    }

    foundTarget = true

    let minedThisRound = false

    for (const block of candidates) {
      const result = await mineSingleBlockWithRetries(bot, block, materialDef, shouldCancel, announce)

      if (result.canceled) {
        const message = `Stopped mining. Removed ${minedCount} ${materialDef.displayName} block(s).`

        if (announce) {
          bot.chat(message)
        }

        return {
          minedCount,
          collectedCount: 0,
          canceled: true,
          foundTarget,
          status: 'canceled',
          message,
          lastFailureReason
        }
      }

      const after = getBlockAtPosition(bot, block.position)
      if (!isMatchingBlock(after, materialDef)) {
        minedCount += 1
        minedThisRound = true
        lastFailureReason = null
        break
      }

      lastFailureReason = result.reason

      if (announce) {
        bot.chat(
          `Skipping stuck ${materialDef.displayName} at ${block.position}. Reason: ${result.reason}`
        )
      }
    }

    if (!minedThisRound) {
      const message = `I found ${materialDef.displayName}, but could not reach or mine it. Last reason: ${lastFailureReason || 'unknown'}.`

      if (announce) {
        bot.chat(message)
      }

      return {
        minedCount,
        collectedCount: 0,
        canceled: false,
        foundTarget,
        status: 'target_failed',
        message,
        lastFailureReason
      }
    }

    await sleep(150)
  }

  if (!autoHarvest) {
    const message = `Mining complete. Removed ${minedCount} ${materialDef.displayName} block(s).`

    if (announce) {
      bot.chat(message)
    }

    return {
      minedCount,
      collectedCount: 0,
      canceled: false,
      foundTarget,
      status: 'completed',
      message,
      lastFailureReason
    }
  }

  if (settleDelayMs > 0) {
    await sleep(settleDelayMs)
  }

  try {
    const collectResult = await collectNearbyDrops(bot, {
      shouldCancel,
      silentNoDrops: true,
      announce
    })

    const message =
      minedCount > 0
        ? `Mining complete. Removed ${minedCount} ${materialDef.displayName} block(s).`
        : foundTarget
          ? `I found ${materialDef.displayName}, but could not mine it. Last reason: ${lastFailureReason || 'unknown'}.`
          : `I do not see any nearby ${materialDef.displayName}.`

    return {
      minedCount,
      collectedCount: collectResult?.visitedCount || 0,
      canceled: !!collectResult?.canceled,
      foundTarget,
      status: minedCount > 0 ? 'completed' : foundTarget ? 'target_failed' : 'not_found',
      message,
      lastFailureReason
    }
  } catch (err) {
    console.log('Material harvest failed:', err.message)

    const message =
      minedCount > 0
        ? `Mining complete. Removed ${minedCount} ${materialDef.displayName} block(s), but harvest failed.`
        : foundTarget
          ? `I found ${materialDef.displayName}, but had trouble finishing the job. Last reason: ${lastFailureReason || 'unknown'}.`
          : `I do not see any nearby ${materialDef.displayName}.`

    return {
      minedCount,
      collectedCount: 0,
      canceled: false,
      foundTarget,
      status: minedCount > 0 ? 'completed' : foundTarget ? 'target_failed' : 'not_found',
      message,
      lastFailureReason
    }
  }
}

module.exports = {
  MATERIAL_DEFS,
  getMaterialDef,
  mineMaterial
}
```

## actions/mineStone.js

```js
const { goals } = require('mineflayer-pathfinder')
const { collectNearbyDrops } = require('./collectDrops')

const STONE_NAMES = new Set([
  'stone',
  'cobblestone',
  'deepslate',
  'cobbled_deepslate'
])

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isStoneBlock(block) {
  return !!block && STONE_NAMES.has(block.name)
}

function getBlockAtPosition(bot, position) {
  return bot.blockAt(position)
}

async function waitForBlockToChange(bot, position, timeoutMs = 4000, intervalMs = 150) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const current = getBlockAtPosition(bot, position)
    if (!isStoneBlock(current)) {
      return true
    }

    await sleep(intervalMs)
  }

  return false
}

async function moveNearBlock(bot, block, shouldCancel) {
  if (!block || !block.position) return false
  if (shouldCancel && shouldCancel()) return false

  const goal = new goals.GoalNear(
    Math.floor(block.position.x),
    Math.floor(block.position.y),
    Math.floor(block.position.z),
    1
  )

  await bot.pathfinder.goto(goal)

  if (shouldCancel && shouldCancel()) return false

  const freshBlock = getBlockAtPosition(bot, block.position)
  if (!freshBlock) return false

  const dist = bot.entity.position.distanceTo(freshBlock.position)
  return dist <= 3.25
}

async function equipBestTool(bot, block) {
  try {
    const tool = bot.pathfinder.bestHarvestTool(block)
    if (tool) {
      await bot.equip(tool, 'hand')
    }
  } catch (err) {
    console.log('Could not equip tool:', err.message)
  }
}

async function digBlock(bot, block, shouldCancel) {
  if (!block) return { success: false, reason: 'no_block' }
  if (!block.diggable) return { success: false, reason: 'not_diggable' }
  if (shouldCancel && shouldCancel()) return { success: false, reason: 'canceled' }

  const moved = await moveNearBlock(bot, block, shouldCancel)
  if (!moved) {
    return { success: false, reason: 'move_failed' }
  }

  const freshBlock = getBlockAtPosition(bot, block.position)

  if (!freshBlock) {
    return { success: true, reason: 'already_gone' }
  }

  if (!isStoneBlock(freshBlock)) {
    return { success: true, reason: 'already_changed' }
  }

  if (!freshBlock.diggable) {
    return { success: false, reason: 'fresh_not_diggable' }
  }

  await equipBestTool(bot, freshBlock)

  if (shouldCancel && shouldCancel()) {
    return { success: false, reason: 'canceled' }
  }

  try {
    await bot.lookAt(freshBlock.position.offset(0.5, 0.5, 0.5), true)
  } catch (err) {
    console.log('LookAt failed:', err.message)
  }

  if (typeof bot.canDigBlock === 'function') {
    try {
      if (!bot.canDigBlock(freshBlock)) {
        return { success: false, reason: 'cannot_dig_from_here' }
      }
    } catch (err) {
      console.log('canDigBlock check failed:', err.message)
    }
  }

  try {
    await bot.dig(freshBlock, true)
  } catch (err) {
    return {
      success: false,
      reason: `dig_error:${err.message}`
    }
  }

  const changed = await waitForBlockToChange(bot, freshBlock.position, 3500, 150)

  if (!changed) {
    const after = getBlockAtPosition(bot, freshBlock.position)
    if (after && isStoneBlock(after)) {
      return { success: false, reason: 'block_still_exists_after_dig' }
    }
  }

  return { success: true, reason: 'dug' }
}

function findNearbyStone(bot, maxDistance = 24) {
  return bot.findBlock({
    matching: block => isStoneBlock(block),
    maxDistance
  })
}

async function mineSingleStoneWithRetries(bot, block, shouldCancel, announce) {
  const maxAttempts = 3
  let lastReason = 'unknown'

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (shouldCancel && shouldCancel()) {
      return { success: false, canceled: true, reason: 'canceled' }
    }

    const freshBlock = getBlockAtPosition(bot, block.position)

    if (!freshBlock || !isStoneBlock(freshBlock)) {
      return { success: true, canceled: false, reason: 'already_gone' }
    }

    const result = await digBlock(bot, freshBlock, shouldCancel)
    lastReason = result.reason

    if (result.success) {
      return { success: true, canceled: false, reason: result.reason }
    }

    if (announce) {
      bot.chat(`Stone dig attempt ${attempt} failed: ${result.reason}`)
    }

    await sleep(250)
  }

  return { success: false, canceled: false, reason: lastReason }
}

async function mineStone(bot, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false)
  const autoHarvest = options.autoHarvest !== false
  const announce = options.announce !== false
  const maxBlocks = options.maxBlocks || 8
  const maxDistance = options.maxDistance || 24
  const settleDelayMs = options.settleDelayMs ?? 800

  if (shouldCancel()) {
    if (announce) {
      bot.chat('Stone mining canceled.')
    }

    return {
      minedCount: 0,
      collectedCount: 0,
      canceled: true
    }
  }

  let minedCount = 0

  if (announce) {
    bot.chat('Looking for stone.')
  }

  for (let i = 0; i < maxBlocks; i += 1) {
    if (shouldCancel()) {
      if (announce) {
        bot.chat(`Stopped mining. Removed ${minedCount} stone block(s).`)
      }

      return {
        minedCount,
        collectedCount: 0,
        canceled: true
      }
    }

    const block = findNearbyStone(bot, maxDistance)

    if (!block) {
      if (announce) {
        if (minedCount > 0) {
          bot.chat(`Mining complete. Removed ${minedCount} stone block(s).`)
        } else {
          bot.chat('I do not see any nearby stone.')
        }
      }

      return {
        minedCount,
        collectedCount: 0,
        canceled: false
      }
    }

    const result = await mineSingleStoneWithRetries(bot, block, shouldCancel, announce)

    if (result.canceled) {
      if (announce) {
        bot.chat(`Stopped mining. Removed ${minedCount} stone block(s).`)
      }

      return {
        minedCount,
        collectedCount: 0,
        canceled: true
      }
    }

    const after = getBlockAtPosition(bot, block.position)
    if (!isStoneBlock(after)) {
      minedCount += 1
    } else if (announce) {
      bot.chat(`Skipping stuck stone at ${block.position}. Reason: ${result.reason}`)
    }

    await sleep(150)
  }

  if (!autoHarvest) {
    if (announce) {
      bot.chat(`Mining complete. Removed ${minedCount} stone block(s).`)
    }

    return {
      minedCount,
      collectedCount: 0,
      canceled: false
    }
  }

  if (settleDelayMs > 0) {
    await sleep(settleDelayMs)
  }

  try {
    const collectResult = await collectNearbyDrops(bot, {
      shouldCancel,
      silentNoDrops: true,
      announce
    })

    return {
      minedCount,
      collectedCount: collectResult?.visitedCount || 0,
      canceled: !!collectResult?.canceled
    }
  } catch (err) {
    console.log('Stone harvest failed:', err.message)

    return {
      minedCount,
      collectedCount: 0,
      canceled: false
    }
  }
}

module.exports = {
  mineStone
}
```

## alphaBot.js

```js
// Alpha help
// Alpha craft axe
// Alpha craft planks
// Alpha inventory
// Alpha first tool

// Bravo help
// Bravo craft pickaxe
// Bravo inventory

// all drop


const { createWorkerBot } = require('./bots/createWorkerBot')

createWorkerBot({
  username: 'AlphaBot',
  commandName: 'Alpha',
  personalityPrompt:
    'You are Alpha, a Minecraft worker bot. Keep replies short, direct, and professional.',
  protectTargetName: null
})

```

## bot.js

```js
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { cutTree } = require('./actions/cutTree')
const { collectNearbyDrops } = require('./actions/collectDrops')
const {
  fightNearestHostile,
  getNearestHostileNearPlayer,
  attackEntity
} = require('./actions/fightHostiles')

const OLLAMA_URL = 'http://localhost:11434/api/chat'
const OLLAMA_MODEL = 'llama3.2'

const AUTO_TICK_MS = 1500
const IDLE_WORK_DELAY_MS = 60_000
const FOLLOW_DISTANCE = 3
const DEFEND_RADIUS = 10
const TREE_COOLDOWN_MS = 12_000

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'AI_Bot',
  auth: 'offline'
})

bot.loadPlugin(pathfinder)

const state = {
  mode: 'idle', // idle | moving | cutting | collecting | fighting | chatting | auto_follow | auto_cut | auto_defend
  cancelRequested: false,
  leaderName: null,
  autoLoopRunning: false,
  lastTreeAttemptAt: 0,
  lastActiveAt: Date.now(),
  taskToken: 0
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function setMode(mode) {
  state.mode = mode
  console.log(`Mode set to: ${mode}`)
}

function isBusy() {
  return state.mode !== 'idle'
}

function markActive(reason = 'activity') {
  state.lastActiveAt = Date.now()
  console.log(`Active: ${reason}`)
}

function getIdleMs() {
  return Date.now() - state.lastActiveAt
}

function nextTaskToken() {
  state.taskToken += 1
  return state.taskToken
}

function makeShouldCancel(taskToken) {
  return () => state.cancelRequested || taskToken !== state.taskToken
}

function clearCancelRequest() {
  state.cancelRequested = false
}

function hardStopMotion() {
  try {
    bot.pathfinder.setGoal(null)
  } catch (err) {
    console.log('Could not clear goal:', err.message)
  }

  try {
    bot.pathfinder.stop()
  } catch (err) {
    console.log('Could not stop pathfinder:', err.message)
  }

  try {
    bot.clearControlStates()
  } catch (err) {
    console.log('Could not clear control states:', err.message)
  }
}

function interruptCurrentTask(reason = 'interrupt') {
  state.cancelRequested = true
  nextTaskToken()
  hardStopMotion()
  setMode('idle')
  markActive(reason)
}

function finishTask(taskToken) {
  if (taskToken !== state.taskToken) {
    return
  }

  clearCancelRequest()
  setMode('idle')
  markActive('task_finished')
}

function getPlayerEntity(playerName) {
  if (!playerName) return null
  const player = bot.players[playerName]
  if (!player) return null
  return player.entity || null
}

function getNearestPlayerName() {
  const players = Object.values(bot.players)
    .filter(player => player && player.username && player.username !== bot.username && player.entity)
    .sort((a, b) => {
      const distA = bot.entity.position.distanceTo(a.entity.position)
      const distB = bot.entity.position.distanceTo(b.entity.position)
      return distA - distB
    })

  return players[0]?.username || null
}

function getLeaderName() {
  if (state.leaderName && getPlayerEntity(state.leaderName)) {
    return state.leaderName
  }

  const nearest = getNearestPlayerName()
  if (nearest) {
    state.leaderName = nearest
    return nearest
  }

  return null
}

function setLeaderName(playerName) {
  state.leaderName = playerName
  console.log(`Leader set to: ${playerName}`)
}

async function askOllama(userName, userMessage) {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful Minecraft companion. Keep replies short, friendly, and under 100 characters when possible.'
        },
        {
          role: 'user',
          content: `${userName} says: ${userMessage}`
        }
      ]
    })
  })

  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}`)
  }

  const data = await response.json()
  return data?.message?.content?.trim() || 'I have no response.'
}

function splitMessage(message, maxLen) {
  const parts = []
  let remaining = message

  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf(' ', maxLen)
    if (cut <= 0) cut = maxLen
    parts.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }

  if (remaining.length > 0) {
    parts.push(remaining)
  }

  return parts
}

async function moveNearPlayer(playerName, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false)
  const announce = options.announce !== false
  const distance = options.distance || FOLLOW_DISTANCE

  const player = bot.players[playerName]

  if (!player || !player.entity) {
    if (announce) {
      bot.chat(`I can't find ${playerName}.`)
    }
    return false
  }

  const target = player.entity.position
  const goal = new goals.GoalNear(
    Math.floor(target.x),
    Math.floor(target.y),
    Math.floor(target.z),
    distance
  )

  if (announce) {
    bot.chat(`Coming to you, ${playerName}.`)
  }

  await bot.pathfinder.goto(goal)

  if (shouldCancel()) {
    return false
  }

  if (announce) {
    bot.chat('I am here.')
  }

  return true
}

function getInventorySummary() {
  const items = bot.inventory.items()

  if (!items || items.length === 0) {
    return 'My inventory is empty.'
  }

  const summary = items
    .slice(0, 8)
    .map(item => `${item.name} x${item.count}`)
    .join(', ')

  if (items.length > 8) {
    return `I have: ${summary}, and more.`
  }

  return `I have: ${summary}.`
}

function showHelp() {
  bot.chat(
    'Commands: help, follow me, come here, cut tree, collect items, fight, stop, inventory'
  )
}

async function runAutonomyTick() {
  if (state.autoLoopRunning) return
  if (isBusy()) return

  const leaderName = getLeaderName()
  if (!leaderName) return

  state.autoLoopRunning = true

  try {
    const leaderEntity = getPlayerEntity(leaderName)
    if (!leaderEntity) return

    const hostile = getNearestHostileNearPlayer(bot, leaderName, DEFEND_RADIUS)
    if (hostile) {
      const taskToken = nextTaskToken()
      clearCancelRequest()
      setMode('auto_defend')
      markActive('auto_defend_started')

      try {
        await attackEntity(bot, hostile, {
          shouldCancel: makeShouldCancel(taskToken),
          maxFightTimeMs: 15000,
          announce: false
        })
      } finally {
        finishTask(taskToken)
      }

      return
    }

    const distanceToLeader = bot.entity.position.distanceTo(leaderEntity.position)
    if (distanceToLeader > FOLLOW_DISTANCE + 1.5) {
      const taskToken = nextTaskToken()
      clearCancelRequest()
      setMode('auto_follow')
      markActive('auto_follow_started')

      try {
        await moveNearPlayer(leaderName, {
          shouldCancel: makeShouldCancel(taskToken),
          announce: false,
          distance: FOLLOW_DISTANCE
        })
      } finally {
        finishTask(taskToken)
      }

      return
    }

    if (getIdleMs() < IDLE_WORK_DELAY_MS) {
      return
    }

    const now = Date.now()
    if (now - state.lastTreeAttemptAt < TREE_COOLDOWN_MS) {
      return
    }

    state.lastTreeAttemptAt = now

    const taskToken = nextTaskToken()
    clearCancelRequest()
    setMode('auto_cut')
    markActive('auto_cut_started')

    try {
      await cutTree(bot, {
        shouldCancel: makeShouldCancel(taskToken),
        autoHarvest: true,
        announce: false
      })
    } finally {
      finishTask(taskToken)
    }
  } catch (err) {
    console.error('Autonomy tick error:', err)
    setMode('idle')
    clearCancelRequest()
  } finally {
    state.autoLoopRunning = false
  }
}

async function runCommandTask(mode, reason, runner) {
  interruptCurrentTask(reason)
  await sleep(100)

  const taskToken = nextTaskToken()
  clearCancelRequest()
  setMode(mode)
  markActive(`${mode}_started`)

  try {
    await runner({
      taskToken,
      shouldCancel: makeShouldCancel(taskToken)
    })
  } finally {
    finishTask(taskToken)
  }
}

async function handleCommand(username, prompt) {
  const normalized = prompt.toLowerCase().trim()
  setLeaderName(username)

  if (normalized === 'help' || normalized === 'commands') {
    interruptCurrentTask('help_command')
    showHelp()
    return
  }

  if (normalized === 'stop' || normalized === 'stay' || normalized === 'cancel') {
    interruptCurrentTask('stop_command')
    bot.chat('Stopping now.')
    return
  }

  if (normalized === 'inventory' || normalized === 'what do you have') {
    await runCommandTask('collecting', 'inventory_command', async () => {
      bot.chat(getInventorySummary())
    })
    return
  }

  if (normalized === 'follow me') {
    interruptCurrentTask('follow_command')
    bot.chat(`Okay ${username}, I will stay with you.`)
    return
  }

  if (normalized === 'come here') {
    await runCommandTask('moving', 'come_here_command', async ({ shouldCancel }) => {
      try {
        await moveNearPlayer(username, {
          shouldCancel,
          announce: true,
          distance: 1
        })
      } catch (err) {
        console.error('Movement error:', err)
        bot.chat('I had trouble getting to you.')
      }
    })
    return
  }

  if (normalized === 'fight' || normalized === 'attack mob' || normalized === 'attack mobs') {
    await runCommandTask('fighting', 'fight_command', async ({ shouldCancel }) => {
      try {
        await fightNearestHostile(bot, {
          shouldCancel
        })
      } catch (err) {
        console.error('Fight error:', err)
        bot.chat('I had trouble fighting the hostile mob.')
      }
    })
    return
  }

  if (normalized === 'collect items' || normalized === 'pick up items') {
    await runCommandTask('collecting', 'collect_command', async ({ shouldCancel }) => {
      try {
        await collectNearbyDrops(bot, {
          shouldCancel
        })
      } catch (err) {
        console.error('Collect items error:', err)
        bot.chat('I had trouble collecting items.')
      }
    })
    return
  }

  if (normalized === 'cut tree') {
    await runCommandTask('cutting', 'cut_tree_command', async ({ shouldCancel }) => {
      try {
        state.lastTreeAttemptAt = Date.now()

        await cutTree(bot, {
          shouldCancel,
          autoHarvest: true,
          announce: true
        })
      } catch (err) {
        console.error('Cut tree error:', err)
        bot.chat('I had trouble cutting the tree.')
      }
    })
    return
  }

  await runCommandTask('chatting', 'chat_command', async ({ shouldCancel }) => {
    try {
      const reply = await askOllama(username, prompt)
      const lines = splitMessage(reply, 100)

      for (const line of lines) {
        if (shouldCancel()) {
          bot.chat('Chat canceled.')
          break
        }

        bot.chat(line)
        await sleep(150)
      }
    } catch (err) {
      console.error('Ollama error:', err)
      bot.chat('I could not reach Ollama.')
    }
  })
}

bot.on('spawn', () => {
  console.log('Bot joined the world!')

  const defaultMoves = new Movements(bot)
  bot.pathfinder.setMovements(defaultMoves)

  bot.chat('AI_Bot is online. I will stay nearby, defend you, and work after being idle.')

  markActive('spawn')

  setInterval(() => {
    runAutonomyTick().catch(err => console.error('Autonomy loop failure:', err))
  }, AUTO_TICK_MS)
})

bot.on('chat', async (username, message) => {
  console.log(`${username}: ${message}`)

  if (username === bot.username) return
  if (!message.toLowerCase().startsWith('bot ')) return

  const prompt = message.slice(4).trim()

  if (!prompt) {
    bot.chat('Say something like: bot help')
    return
  }

  markActive('incoming_command')
  await handleCommand(username, prompt)
})

bot.on('path_update', results => {
  console.log(`Path update: ${results.status}`)
})

bot.on('goal_reached', () => {
  console.log('Bot reached the goal.')
  markActive('goal_reached')
})

bot.on('entityHurt', entity => {
  if (entity && entity.id === bot.entity.id) {
    markActive('bot_hurt')
  }
})

bot.on('error', err => console.log('Bot error:', err))
bot.on('end', () => console.log('Bot disconnected'))
bot.on('kicked', reason => console.log('Bot kicked:', reason))
```

## bots/createWorkerBot.js

```js
const fs = require('fs')
const path = require('path')
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { mineMaterial } = require('../actions/mineMaterial')
const { cutTree } = require('../actions/cutTree')
const { collectNearbyDrops } = require('../actions/collectDrops')
const { bootstrapFirstTool } = require('../actions/bootstrapFirstTool')
const {
  fightNearestHostile,
  getNearestHostile,
  attackEntity
} = require('../actions/fightHostiles')

const OLLAMA_URL = 'http://localhost:11434/api/chat'
const OLLAMA_MODEL = 'llama3.2'

const AUTO_TICK_MS = 1200
const IDLE_WORK_DELAY_MS = 5000
const FOLLOW_DISTANCE = 3
const ENGAGE_RADIUS = 16
const PROTECT_RADIUS = 12
const STONE_COOLDOWN_MS = 9000

const CRAFTING_DATA_PATH = path.join(__dirname, '..', 'data', 'craftingRecipes.json')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isExpectedPathStopError(err) {
  if (!err) return false

  const message = String(err.message || err)
  return (
    message.includes('Path was stopped before it could be completed') ||
    message.includes('The goal was changed before it could be completed')
  )
}

async function safeGoto(goal) {
  try {
    await bot.pathfinder.goto(goal)
    return { success: true, reason: 'ok' }
  } catch (err) {
    if (isExpectedPathStopError(err)) {
      return { success: false, reason: 'path_stopped' }
    }

    return {
      success: false,
      reason: err?.message || 'goto_failed'
    }
  }
}


function createWorkerBot(config) {
  const {
    username,
    commandName,
    personalityPrompt,
    protectTargetName = null
  } = config

  const bot = mineflayer.createBot({
    host: 'localhost',
    port: 25565,
    username,
    auth: 'offline'
  })

  bot.loadPlugin(pathfinder)

  const state = {
    mode: 'idle',
    cancelRequested: false,
    leaderName: null,
    autoLoopRunning: false,
    lastMineAttemptAt: 0,
    lastActiveAt: Date.now(),
    taskToken: 0,
    rallyHold: false,
    craftingData: null
  }

  function log(message, ...args) {
    console.log(`[${commandName}] ${message}`, ...args)
  }

  function setMode(mode) {
    state.mode = mode
    log(`Mode set to: ${mode}`)
  }

  function isBusy() {
    return state.mode !== 'idle'
  }

  function markActive(reason = 'activity') {
    state.lastActiveAt = Date.now()
    log(`Active: ${reason}`)
  }

  function getIdleMs() {
    return Date.now() - state.lastActiveAt
  }

  function nextTaskToken() {
    state.taskToken += 1
    return state.taskToken
  }

  function makeShouldCancel(taskToken) {
    return () => state.cancelRequested || taskToken !== state.taskToken
  }

  function clearCancelRequest() {
    state.cancelRequested = false
  }

  function hardStopMotion() {
    try {
      bot.pathfinder.setGoal(null)
    } catch (err) {
      log(`Could not clear goal: ${err.message}`)
    }

    try {
      bot.pathfinder.stop()
    } catch (err) {
      log(`Could not stop pathfinder: ${err.message}`)
    }

    try {
      bot.clearControlStates()
    } catch (err) {
      log(`Could not clear control states: ${err.message}`)
    }
  }

  function interruptCurrentTask(reason = 'interrupt') {
    state.cancelRequested = true
    nextTaskToken()
    hardStopMotion()
    setMode('idle')
    markActive(reason)
    state.rallyHold = false
  }

  function finishTask(taskToken) {
    if (taskToken !== state.taskToken) return
    clearCancelRequest()
    setMode('idle')
    markActive('task_finished')
  }

  function getPlayerEntity(playerName) {
    if (!playerName) return null
    const player = bot.players[playerName]
    if (!player) return null
    return player.entity || null
  }

  function getNearestPlayerName() {
    const players = Object.values(bot.players)
      .filter(player => player && player.username && player.username !== bot.username && player.entity)
      .sort((a, b) => {
        const distA = bot.entity.position.distanceTo(a.entity.position)
        const distB = bot.entity.position.distanceTo(b.entity.position)
        return distA - distB
      })

    return players[0]?.username || null
  }

  function getLeaderName() {
    if (state.leaderName && getPlayerEntity(state.leaderName)) {
      return state.leaderName
    }

    const nearest = getNearestPlayerName()
    if (nearest) {
      state.leaderName = nearest
      return nearest
    }

    return null
  }

  function setLeaderName(playerName) {
    state.leaderName = playerName
    log(`Leader set to: ${playerName}`)
  }

  function loadCraftingData() {
    try {
      const raw = fs.readFileSync(CRAFTING_DATA_PATH, 'utf8')
      const parsed = JSON.parse(raw)

      state.craftingData = {
        items: parsed.items || {},
        aliases: parsed.aliases || {},
        groups: parsed.groups || {}
      }

      log(`Loaded crafting recipes: ${Object.keys(state.craftingData.items).length} item(s)`)
    } catch (err) {
      log(`Failed to load craftingRecipes.json: ${err.message}`)
      state.craftingData = {
        items: {},
        aliases: {},
        groups: {}
      }
    }
  }

  function getCraftingData() {
    if (!state.craftingData) {
      loadCraftingData()
    }

    return state.craftingData
  }

  function normalizeRecipeKey(name) {
    if (!name) return ''
    return name.toLowerCase().trim().replace(/\s+/g, '_')
  }

  function applyBuiltInRecipeAliases(normalized) {
    const fallbackAliases = {
      pickaxe: 'wooden_pickaxe',
      axe: 'wooden_axe',
      shovel: 'wooden_shovel',
      sword: 'wooden_sword',
      hoe: 'wooden_hoe'
    }

    return fallbackAliases[normalized] || normalized
  }

  function resolveRecipeName(name) {
    const craftingData = getCraftingData()
    let normalized = normalizeRecipeKey(name)

    if (!normalized) return null

    normalized = applyBuiltInRecipeAliases(normalized)

    if (craftingData.items[normalized]) return normalized

    const aliasTarget = craftingData.aliases[normalized]
    if (aliasTarget && craftingData.items[aliasTarget]) {
      return aliasTarget
    }

    return null
  }

  function getRecipe(recipeName) {
    const craftingData = getCraftingData()
    return craftingData.items[recipeName] || null
  }

  function getRecipeItemId(itemName) {
    const item = bot.registry.itemsByName[itemName]
    return item ? item.id : null
  }

  function getItemCount(itemName) {
    return bot.inventory
      .items()
      .filter(item => item.name === itemName)
      .reduce((sum, item) => sum + item.count, 0)
  }

  function getItemByName(itemName) {
    return bot.inventory.items().find(item => item.name === itemName) || null
  }

  function getGroupMembers(groupName) {
    const craftingData = getCraftingData()
    return craftingData.groups[groupName] || []
  }

  function getInventoryCountForRequirement(name) {
    const groupMembers = getGroupMembers(name)

    if (groupMembers.length > 0) {
      return groupMembers.reduce((sum, memberName) => sum + getItemCount(memberName), 0)
    }

    return getItemCount(name)
  }

  function getAnyLogName() {
    const preferredFromGroup = getGroupMembers('logs')
    const fallbackLogs = [
      'oak_log',
      'spruce_log',
      'birch_log',
      'jungle_log',
      'acacia_log',
      'dark_oak_log',
      'mangrove_log',
      'cherry_log',
      'crimson_stem',
      'warped_stem'
    ]

    const logNames = preferredFromGroup.length > 0 ? preferredFromGroup : fallbackLogs

    for (const logName of logNames) {
      if (getItemCount(logName) > 0) {
        return logName
      }
    }

    return null
  }

  function getFirstAvailableLogName() {
    return getAnyLogName()
  }

  function getPlankNameFromLogName(logName) {
    if (!logName) return null
    return logName.replace('_log', '_planks').replace('_stem', '_planks')
  }

  function getNearbyDroppedItems(maxDistance = 12) {
    return Object.values(bot.entities).filter(entity => {
      if (!entity) return false
      if (!entity.position) return false
      if (entity.name !== 'item') return false
      return bot.entity.position.distanceTo(entity.position) <= maxDistance
    })
  }

  function hasNearbyTree(maxDistance = 24) {
    const logGroup = getGroupMembers('logs')
    const fallbackLogs = [
      'oak_log',
      'spruce_log',
      'birch_log',
      'jungle_log',
      'acacia_log',
      'dark_oak_log',
      'mangrove_log',
      'cherry_log',
      'crimson_stem',
      'warped_stem'
    ]

    const logNames = new Set(logGroup.length > 0 ? logGroup : fallbackLogs)

    const block = bot.findBlock({
      matching: block => !!block && logNames.has(block.name),
      maxDistance
    })

    return !!block
  }

  function hasNearbyStoneLike(maxDistance = 24) {
    const block = bot.findBlock({
      matching: block =>
        !!block &&
        ['stone', 'cobblestone', 'deepslate', 'cobbled_deepslate'].includes(block.name),
      maxDistance
    })

    return !!block
  }

  function describeNearbySourcesForRequirement(requirementName) {
    if (requirementName === 'planks' || requirementName === 'logs') {
      return { canGather: hasNearbyTree(24), source: 'tree' }
    }

    if (requirementName === 'cobblestone' || requirementName === 'stone') {
      return { canGather: hasNearbyStoneLike(24), source: 'stone' }
    }

    return { canGather: false, source: null }
  }

  function neededBlockCountFromRequirement(requirementName, missingCount) {
    if (requirementName === 'planks') {
      return Math.ceil(missingCount / 4)
    }

    return missingCount
  }

  function findNearbyCraftingTable(maxDistance = 8) {
    return bot.findBlock({
      matching: block => block && block.name === 'crafting_table',
      maxDistance
    })
  }

async function moveNearBlock(block, distance = 2) {
  const goal = new goals.GoalNear(
    Math.floor(block.position.x),
    Math.floor(block.position.y),
    Math.floor(block.position.z),
    distance
  )

  const result = await safeGoto(goal)

  if (!result.success) {
    throw new Error(result.reason)
  }
}


  function findNearbyPlacePosition(maxDistance = 4) {
    const base = bot.entity.position.floored()

    for (let dx = -maxDistance; dx <= maxDistance; dx += 1) {
      for (let dz = -maxDistance; dz <= maxDistance; dz += 1) {
        const pos = base.offset(dx, -1, dz)
        const top = pos.offset(0, 1, 0)
        const ground = bot.blockAt(pos)
        const air = bot.blockAt(top)

        if (!ground || !air) continue
        if (!['air', 'cave_air', 'void_air'].includes(air.name)) continue
        if (['air', 'cave_air', 'void_air'].includes(ground.name)) continue

        return { ground, placePos: top }
      }
    }

    return null
  }

  async function placeCraftingTable() {
    const tableItem = getItemByName('crafting_table')
    if (!tableItem) {
      throw new Error('No crafting table in inventory')
    }

    const found = findNearbyPlacePosition(4)
    if (!found) {
      throw new Error('Could not find a nearby place position for crafting table')
    }

    await bot.equip(tableItem, 'hand')
    await bot.lookAt(found.ground.position.offset(0.5, 1, 0.5), true)
    await bot.placeBlock(found.ground, { x: 0, y: 1, z: 0 })
    await sleep(500)

    const placed = bot.blockAt(found.placePos)
    if (!placed || placed.name !== 'crafting_table') {
      throw new Error('Crafting table placement failed')
    }

    return placed
  }

  async function craftItemByMinecraftRecipe(itemName, count = 1, craftingTableBlock = null) {
    const itemId = getRecipeItemId(itemName)
    if (!itemId) {
      throw new Error(`Unknown craft item: ${itemName}`)
    }

    const recipes = bot.recipesFor(itemId, null, 1, craftingTableBlock || null)

    if (!recipes || recipes.length === 0) {
      throw new Error(`No Minecraft recipe available for ${itemName}`)
    }

    await bot.craft(recipes[0], count, craftingTableBlock || null)
  }

  function isGroupRequirement(requirementName) {
    return getGroupMembers(requirementName).length > 0
  }

  function getGroupMemberInventoryList(groupName) {
    return getGroupMembers(groupName)
      .map(memberName => ({
        name: memberName,
        count: getItemCount(memberName)
      }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
  }

  function getPreferredConcreteItemForRequirement(requirementName) {
    if (!isGroupRequirement(requirementName)) {
      return requirementName
    }

    const membersWithInventory = getGroupMemberInventoryList(requirementName)
    if (membersWithInventory.length > 0) {
      return membersWithInventory[0].name
    }

    const members = getGroupMembers(requirementName)
    return members[0] || requirementName
  }

  async function gatherAndCraftAnyPlanks(shouldCancel = () => false, announce = true) {
    if (shouldCancel()) {
      return { success: false, reason: 'canceled' }
    }

    const hadLogs = !!getFirstAvailableLogName()

    if (!hadLogs) {
      if (announce) {
        bot.chat('I need wood first. Cutting a tree.')
      }

      const cutResult = await cutTree(bot, {
        shouldCancel,
        autoHarvest: true,
        announce
      })

      if (cutResult.canceled) {
        return { success: false, reason: 'canceled' }
      }

      if ((cutResult.cutCount || 0) <= 0) {
        return { success: false, reason: 'tree_gather_failed' }
      }
    }

    const logName = getFirstAvailableLogName()
    if (!logName) {
      return { success: false, reason: 'no_logs_after_gather' }
    }

    const plankName = getPlankNameFromLogName(logName)

    try {
      if (announce) {
        bot.chat(`Converting ${logName} into planks.`)
      }

      await craftItemByMinecraftRecipe(plankName, 1, null)
      await sleep(250)

      return {
        success: true,
        reason: 'completed',
        craftedItem: plankName
      }
    } catch (err) {
      return {
        success: false,
        reason: `minecraft_craft_failed:${err.message}`
      }
    }
  }

  async function convertLogsToPlanksIfNeeded(requiredPlanks, options = {}) {
    const shouldCancel = options.shouldCancel || (() => false)
    const announce = options.announce !== false

    if (getInventoryCountForRequirement('planks') >= requiredPlanks) {
      return { success: true, reason: 'already_have_planks' }
    }

    let craftedAny = false

    while (getInventoryCountForRequirement('planks') < requiredPlanks) {
      if (shouldCancel()) {
        return { success: false, reason: 'canceled' }
      }

      const logName = getFirstAvailableLogName()
      if (!logName) break

      const plankName = getPlankNameFromLogName(logName)

      if (announce) {
        bot.chat(`Converting ${logName} into planks.`)
      }

      try {
        await craftItemByMinecraftRecipe(plankName, 1, null)
        craftedAny = true
        await sleep(250)
      } catch (err) {
        return { success: false, reason: `plank_conversion_failed:${err.message}` }
      }
    }

    if (getInventoryCountForRequirement('planks') >= requiredPlanks) {
      return {
        success: true,
        reason: craftedAny ? 'converted_logs_to_planks' : 'already_have_planks'
      }
    }

    return { success: false, reason: 'not_enough_logs_for_planks' }
  }

  async function acquireLeafRequirement(requirementName, missingCount, options = {}) {
    const shouldCancel = options.shouldCancel || (() => false)
    const announce = options.announce !== false

    if (shouldCancel()) {
      return { success: false, reason: 'canceled' }
    }

    if (requirementName === 'planks') {
      const nearby = describeNearbySourcesForRequirement('planks')

      if (!nearby.canGather) {
        return { success: false, reason: 'no_nearby_tree' }
      }

      if (announce) {
        bot.chat(`I need ${missingCount} planks. Getting wood first.`)
      }

      const result = await cutTree(bot, {
        shouldCancel,
        autoHarvest: true,
        announce
      })

      if (result.canceled) {
        return { success: false, reason: 'canceled' }
      }

      if ((result.cutCount || 0) <= 0) {
        return { success: false, reason: 'tree_gather_failed' }
      }

      return convertLogsToPlanksIfNeeded(missingCount, { shouldCancel, announce })
    }

    if (requirementName === 'logs') {
      const nearby = describeNearbySourcesForRequirement('logs')

      if (!nearby.canGather) {
        return { success: false, reason: 'no_nearby_tree' }
      }

      if (announce) {
        bot.chat(`I need ${missingCount} logs. Cutting a tree.`)
      }

      const result = await cutTree(bot, {
        shouldCancel,
        autoHarvest: true,
        announce
      })

      if (result.canceled) {
        return { success: false, reason: 'canceled' }
      }

      if ((result.cutCount || 0) <= 0) {
        return { success: false, reason: 'tree_gather_failed' }
      }

      return { success: true, reason: 'gathered_logs' }
    }

    if (requirementName === 'cobblestone' || requirementName === 'stone') {
      const nearby = describeNearbySourcesForRequirement(requirementName)

      if (!nearby.canGather) {
        return { success: false, reason: 'no_nearby_stone' }
      }

      if (announce) {
        bot.chat(`I need ${missingCount} ${requirementName}. Mining stone.`)
      }

      const mineTarget = requirementName === 'cobblestone' ? 'stone' : requirementName

      const result = await mineMaterial(bot, mineTarget, {
        shouldCancel,
        autoHarvest: true,
        announce,
        maxBlocks: Math.max(neededBlockCountFromRequirement(requirementName, missingCount), 3),
        maxDistance: 24
      })

      if (result.canceled) {
        return { success: false, reason: 'canceled' }
      }

      if ((result.minedCount || 0) <= 0) {
        return { success: false, reason: 'stone_gather_failed' }
      }

      return { success: true, reason: 'gathered_stone' }
    }

    return { success: false, reason: `cannot_auto_gather:${requirementName}` }
  }

  async function ensureRequirementAvailable(requirementName, requiredCount, options = {}) {
    const shouldCancel = options.shouldCancel || (() => false)
    const announce = options.announce !== false
    const depth = options.depth || 0

    if (depth > 8) {
      return { success: false, reason: 'ensure_requirement_depth_exceeded' }
    }

    if (shouldCancel()) {
      return { success: false, reason: 'canceled' }
    }

    const onHand = getInventoryCountForRequirement(requirementName)
    if (onHand >= requiredCount) {
      return { success: true, reason: 'already_have_requirement' }
    }

    if (requirementName === 'planks') {
      const convertResult = await convertLogsToPlanksIfNeeded(requiredCount, {
        shouldCancel,
        announce: false
      })

      if (convertResult.success && getInventoryCountForRequirement(requirementName) >= requiredCount) {
        return { success: true, reason: 'converted_logs_to_planks' }
      }
    }

    const missingCount = requiredCount - getInventoryCountForRequirement(requirementName)
    const recipeName = resolveRecipeName(requirementName)

    if (recipeName) {
      const recipe = getRecipe(recipeName)
      const outputCount = recipe?.outputCount || 1
      const craftTimes = Math.ceil(missingCount / outputCount)

      for (let i = 0; i < craftTimes; i += 1) {
        const desiredCount = getItemCount(recipeName) + 1

        const craftResult = await craftRecipeByName(recipeName, {
          shouldCancel,
          announce,
          depth: depth + 1,
          targetCount: desiredCount
        })

        if (!craftResult.success) {
          return craftResult
        }
      }

      if (getInventoryCountForRequirement(requirementName) >= requiredCount) {
        return { success: true, reason: 'crafted_requirement' }
      }
    }

    const gatherResult = await acquireLeafRequirement(requirementName, missingCount, {
      shouldCancel,
      announce
    })

    if (!gatherResult.success) {
      return gatherResult
    }

    if (getInventoryCountForRequirement(requirementName) >= requiredCount) {
      return { success: true, reason: 'gathered_requirement' }
    }

    return { success: false, reason: `still_missing:${requirementName}` }
  }

  async function ensureCraftingTableAccess(shouldCancel = () => false, announce = true) {
    if (shouldCancel()) {
      throw new Error('Craft canceled')
    }

    let tableBlock = findNearbyCraftingTable(8)
    if (tableBlock) {
      await moveNearBlock(tableBlock, 2)
      return tableBlock
    }

    if (getItemCount('crafting_table') <= 0) {
      const craftResult = await craftRecipeByName('crafting_table', {
        shouldCancel,
        announce,
        depth: 0,
        targetCount: 1
      })

      if (!craftResult.success) {
        throw new Error(`Could not craft crafting table: ${craftResult.reason}`)
      }
    }

    if (announce) {
      bot.chat('Placing crafting table.')
    }

    tableBlock = await placeCraftingTable()
    await moveNearBlock(tableBlock, 2)
    return tableBlock
  }

  async function craftRecipeByName(recipeName, options = {}) {
    const shouldCancel = options.shouldCancel || (() => false)
    const announce = options.announce !== false
    const depth = options.depth || 0
    const targetCount = options.targetCount || 1

    if (depth > 10) {
      return { success: false, reason: 'craft_dependency_depth_exceeded' }
    }

    if (shouldCancel()) {
      return { success: false, reason: 'canceled' }
    }

    const resolvedRecipeName = resolveRecipeName(recipeName)
    if (!resolvedRecipeName) {
      return { success: false, reason: `unknown_recipe:${recipeName}` }
    }

    const recipe = getRecipe(resolvedRecipeName)
    if (!recipe) {
      return { success: false, reason: `missing_recipe_data:${resolvedRecipeName}` }
    }

    if (getItemCount(resolvedRecipeName) >= targetCount) {
      return {
        success: true,
        reason: 'already_have_item',
        craftedItem: resolvedRecipeName
      }
    }

    for (const ingredient of recipe.ingredients || []) {
      const ensureResult = await ensureRequirementAvailable(ingredient.item, ingredient.count, {
        shouldCancel,
        announce,
        depth: depth + 1
      })

      if (!ensureResult.success) {
        return {
          success: false,
          reason: ensureResult.reason,
          craftedItem: null
        }
      }
    }

    const craftingTableBlock = recipe.requiresTable
      ? await ensureCraftingTableAccess(shouldCancel, announce)
      : null

    if (announce && depth === 0) {
      bot.chat(`Crafting ${recipe.displayName || resolvedRecipeName}.`)
    }

    try {
      await craftItemByMinecraftRecipe(resolvedRecipeName, 1, craftingTableBlock)
      await sleep(300)
    } catch (err) {
      return {
        success: false,
        reason: `minecraft_craft_failed:${err.message}`,
        craftedItem: null
      }
    }

    if (getItemCount(resolvedRecipeName) <= 0) {
      return {
        success: false,
        reason: 'crafted_item_not_found_in_inventory',
        craftedItem: null
      }
    }

    try {
      const craftedItem = getItemByName(resolvedRecipeName)
      if (craftedItem) {
        await bot.equip(craftedItem, 'hand')
      }
    } catch (err) {
      log(`Could not equip crafted item: ${err.message}`)
    }

    return {
      success: true,
      reason: 'completed',
      craftedItem: resolvedRecipeName
    }
  }

  async function tryCraftByUserRequest(requestedName, shouldCancel, announce = true) {
    const normalizedRequestedName = applyBuiltInRecipeAliases(normalizeRecipeKey(requestedName))
    const resolvedRecipeName = resolveRecipeName(normalizedRequestedName)

    if (!resolvedRecipeName) {
      const knownItems = Object.keys(getCraftingData().items).slice(0, 12).join(', ')

      return {
        success: false,
        reason: `unknown_recipe:${requestedName}`,
        message: `I do not know that recipe yet. Known recipes include: ${knownItems}.`
      }
    }

    const result = await craftRecipeByName(resolvedRecipeName, {
      shouldCancel,
      announce,
      depth: 0,
      targetCount: 1
    })

    if (!result.success) {
      return {
        success: false,
        reason: result.reason,
        message: `I had trouble crafting ${resolvedRecipeName}. Reason: ${result.reason}.`
      }
    }

    return {
      success: true,
      reason: result.reason,
      message: `Craft complete: ${resolvedRecipeName}.`
    }
  }

  async function dropAllInventory() {
    const items = bot.inventory.items()

    if (!items.length) {
      bot.chat('My inventory is empty.')
      return
    }

    bot.chat(`Dropping ${items.length} inventory stack(s).`)

    for (const item of items) {
      try {
        await bot.tossStack(item)
      } catch (err) {
        log(`Failed to toss ${item.name}: ${err.message}`)
      }
    }

    bot.chat('Done dropping inventory.')
  }

  function getInventorySummary() {
    const items = bot.inventory.items()

    if (!items || items.length === 0) {
      return `${commandName} inventory is empty.`
    }

    const summary = items
      .slice(0, 8)
      .map(item => `${item.name} x${item.count}`)
      .join(', ')

    if (items.length > 8) {
      return `${commandName} has: ${summary}, and more.`
    }

    return `${commandName} has: ${summary}.`
  }

  function getCraftSummary(recipeName) {
    const recipe = getRecipe(recipeName)
    if (!recipe) return null

    const ingredients = (recipe.ingredients || [])
      .map(part => `${part.item} x${part.count}`)
      .join(', ')

    return `${recipeName}: ${ingredients || 'no ingredients listed'}`
  }

  function getNearbyMaterialReport() {
    const parts = []

    if (hasNearbyTree(24)) parts.push('tree nearby')
    if (hasNearbyStoneLike(24)) parts.push('stone nearby')

    const dropCount = getNearbyDroppedItems(12).length
    if (dropCount > 0) {
      parts.push(`dropped items nearby x${dropCount}`)
    }

    if (parts.length === 0) {
      return 'I do not see useful materials nearby.'
    }

    return `Nearby materials: ${parts.join(', ')}.`
  }

  async function askOllama(userName, userMessage) {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          {
            role: 'system',
            content: personalityPrompt
          },
          {
            role: 'user',
            content: `${userName} says: ${userMessage}`
          }
        ]
      })
    })

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`)
    }

    const data = await response.json()
    return data?.message?.content?.trim() || 'No response available.'
  }

  function splitMessage(message, maxLen) {
    const parts = []
    let remaining = message

    while (remaining.length > maxLen) {
      let cut = remaining.lastIndexOf(' ', maxLen)
      if (cut <= 0) cut = maxLen
      parts.push(remaining.slice(0, cut).trim())
      remaining = remaining.slice(cut).trim()
    }

    if (remaining.length > 0) {
      parts.push(remaining)
    }

    return parts
  }

  async function moveNearPlayer(playerName, options = {}) {
    const shouldCancel = options.shouldCancel || (() => false)
    const announce = options.announce !== false
    const distance = options.distance || FOLLOW_DISTANCE

    const player = bot.players[playerName]

    if (!player || !player.entity) {
      if (announce) {
        bot.chat(`${commandName} can't find ${playerName}.`)
      }
      return false
    }

    const target = player.entity.position
    const goal = new goals.GoalNear(
      Math.floor(target.x),
      Math.floor(target.y),
      Math.floor(target.z),
      distance
    )

    if (announce) {
      bot.chat(`${commandName} moving to ${playerName}.`)
    }

    const gotoResult = await safeGoto(goal)

if (!gotoResult.success) {
  if (gotoResult.reason === 'path_stopped') {
    return false
  }

  throw new Error(gotoResult.reason)
}


    if (shouldCancel()) return false

    if (announce) {
      bot.chat(`${commandName} is here.`)
    }

    return true
  }

  function showHelp() {
    bot.chat(
      `${commandName} commands: help, materials, nearby, follow me, come here, rally, mine stone, collect items, fight, first tool, inventory, recipe <item>, craft <item>`
    )
  }

  function getThreatNearProtectedTarget() {
    const targetName = protectTargetName || getLeaderName()
    const targetEntity = getPlayerEntity(targetName)

    if (!targetEntity) {
      return getNearestHostile(bot, ENGAGE_RADIUS)
    }

    const hostiles = Object.values(bot.entities)
      .filter(entity => {
        if (!entity) return false
        if (!entity.position) return false
        if (!entity.name) return false
        if (!['zombie', 'skeleton'].includes(entity.name)) return false
        return targetEntity.position.distanceTo(entity.position) <= PROTECT_RADIUS
      })
      .sort(
        (a, b) =>
          targetEntity.position.distanceTo(a.position) - targetEntity.position.distanceTo(b.position)
      )

    return hostiles[0] || null
  }

  async function runAutonomyTick() {
    if (state.autoLoopRunning) return
    if (isBusy()) return
    if (state.rallyHold) return

    state.autoLoopRunning = true

    try {
      const followName = protectTargetName || getLeaderName()
      const followEntity = getPlayerEntity(followName)

      const threat = getThreatNearProtectedTarget()
      if (threat) {
        const taskToken = nextTaskToken()
        clearCancelRequest()
        setMode('auto_engage')
        markActive('auto_engage_started')

        try {
          await attackEntity(bot, threat, {
            shouldCancel: makeShouldCancel(taskToken),
            maxFightTimeMs: 15000,
            announce: false
          })
        } finally {
          finishTask(taskToken)
        }

        return
      }

      if (followEntity) {
        const distToLeader = bot.entity.position.distanceTo(followEntity.position)
        if (distToLeader > FOLLOW_DISTANCE + 1.5) {
          const taskToken = nextTaskToken()
          clearCancelRequest()
          setMode('auto_follow')
          markActive('auto_follow_started')

          try {
            await moveNearPlayer(followName, {
              shouldCancel: makeShouldCancel(taskToken),
              announce: false,
              distance: FOLLOW_DISTANCE
            })
          } finally {
            finishTask(taskToken)
          }

          return
        }
      }

      if (getIdleMs() < IDLE_WORK_DELAY_MS) return

      const now = Date.now()
      if (now - state.lastMineAttemptAt < STONE_COOLDOWN_MS) return

      state.lastMineAttemptAt = now

      const taskToken = nextTaskToken()
      clearCancelRequest()
      setMode('auto_mine')
      markActive('auto_mine_started')

      try {
        await mineMaterial(bot, 'stone', {
          shouldCancel: makeShouldCancel(taskToken),
          autoHarvest: true,
          announce: false,
          maxBlocks: 6,
          maxDistance: 20
        })

        if (!makeShouldCancel(taskToken)()) {
          await collectNearbyDrops(bot, {
            shouldCancel: makeShouldCancel(taskToken),
            silentNoDrops: true,
            announce: false
          })
        }
      } finally {
        finishTask(taskToken)
      }
    } catch (err) {
      log(`Autonomy tick error: ${err.message}`)
      setMode('idle')
      clearCancelRequest()
    } finally {
      state.autoLoopRunning = false
    }
  }

  async function runCommandTask(mode, reason, runner) {
    interruptCurrentTask(reason)
    await sleep(100)

    const taskToken = nextTaskToken()
    clearCancelRequest()
    setMode(mode)
    markActive(`${mode}_started`)

    try {
      await runner({
        taskToken,
        shouldCancel: makeShouldCancel(taskToken)
      })
    } finally {
      finishTask(taskToken)
    }
  }

  async function handleCommand(username, prompt) {
    const normalized = prompt.toLowerCase().trim()
    setLeaderName(username)

    if (normalized === 'materials' || normalized === 'nearby') {
      interruptCurrentTask('materials_command')
      bot.chat(getNearbyMaterialReport())
      return
    }

    if (normalized === 'help' || normalized === 'commands') {
      interruptCurrentTask('help_command')
      showHelp()
      return
    }

    if (normalized === 'status') {
      interruptCurrentTask('status_command')
      bot.chat(
        `${commandName} status: mode=${state.mode}, leader=${state.leaderName || 'none'}, idleMs=${getIdleMs()}`
      )
      return
    }


    if (normalized === 'stop' || normalized === 'stay' || normalized === 'cancel') {
      interruptCurrentTask('stop_command')
      bot.chat(`${commandName} standing by.`)
      return
    }

    if (normalized === 'inventory' || normalized === 'what do you have') {
      await runCommandTask('reporting', 'inventory_command', async () => {
        bot.chat(getInventorySummary())
      })
      return
    }

    if (normalized === 'follow me') {
      interruptCurrentTask('follow_command')
      bot.chat(`${commandName} will stay with you, ${username}.`)
      return
    }

    if (normalized === 'rally') {
      state.rallyHold = true
      await runCommandTask('rally', 'rally_command', async ({ shouldCancel }) => {
        await moveNearPlayer(username, {
          shouldCancel,
          announce: true,
          distance: 2
        })
        bot.chat(`${commandName} rally complete. Holding position.`)
      })
      return
    }

    if (normalized === 'come here') {
      await runCommandTask('moving', 'come_here_command', async ({ shouldCancel }) => {
        await moveNearPlayer(username, {
          shouldCancel,
          announce: true,
          distance: 1
        })
      })
      return
    }

    if (normalized === 'fight' || normalized === 'attack mob' || normalized === 'attack mobs') {
      await runCommandTask('fighting', 'fight_command', async ({ shouldCancel }) => {
        await fightNearestHostile(bot, { shouldCancel })
      })
      return
    }

    if (normalized === 'collect items' || normalized === 'pick up items') {
      await runCommandTask('collecting', 'collect_command', async ({ shouldCancel }) => {
        await collectNearbyDrops(bot, { shouldCancel })
      })
      return
    }

    if (
      normalized === 'first tool' ||
      normalized === 'bootstrap' ||
      normalized === 'make first tool'
    ) {
      await runCommandTask('crafting', 'bootstrap_first_tool_command', async ({ shouldCancel }) => {
        const result = await bootstrapFirstTool(bot, {
          shouldCancel,
          announce: true,
          preferredTool: 'wooden_axe'
        })

        log('bootstrapFirstTool result:', result)

        if (!result.success && !result.canceled) {
          bot.chat(`${commandName} could not finish first tool. Reason: ${result.reason}.`)
        }
      })
      return
    }

    if (normalized === 'mine stone' || normalized === 'mine rock') {
      await runCommandTask('mining', 'mine_stone_command', async ({ shouldCancel }) => {
        state.lastMineAttemptAt = Date.now()

        await mineMaterial(bot, 'stone', {
          shouldCancel,
          autoHarvest: true,
          announce: true,
          maxBlocks: 6,
          maxDistance: 20
        })
      })
      return
    }

    if (normalized.startsWith('recipe ')) {
      const requestedItem = prompt.slice('recipe '.length).trim()
      const resolvedRecipeName = resolveRecipeName(requestedItem)

      if (!resolvedRecipeName) {
        bot.chat(`I do not know the recipe for ${requestedItem}.`)
        return
      }

      const summary = getCraftSummary(resolvedRecipeName)
      bot.chat(summary || `I could not summarize the recipe for ${resolvedRecipeName}.`)
      return
    }

    if (normalized.startsWith('craft ')) {
      const requestedItem = prompt.slice('craft '.length).trim()

      if (!requestedItem) {
        bot.chat(`Say something like: ${commandName} craft wooden axe`)
        return
      }

      await runCommandTask('crafting', 'craft_command', async ({ shouldCancel }) => {
        try {
          const normalizedRequested = normalizeRecipeKey(requestedItem)

          if (normalizedRequested === 'planks') {
            const result = await gatherAndCraftAnyPlanks(shouldCancel, true)

            if (!result.success) {
              bot.chat(`${commandName} had trouble crafting planks. Reason: ${result.reason}.`)
              return
            }

            bot.chat(`Craft complete: ${result.craftedItem}.`)
            return
          }

          const result = await tryCraftByUserRequest(requestedItem, shouldCancel, true)
          bot.chat(result.message)
        } catch (err) {
          if (isExpectedPathStopError(err) || String(err.message || err) === 'path_stopped') {
            bot.chat(`${commandName} stopped the current path.`)
            return
          }

          throw err
        }
      })


      return
    }

    await runCommandTask('chatting', 'chat_command', async ({ shouldCancel }) => {
      const reply = await askOllama(username, prompt)
      const lines = splitMessage(reply, 100)

      for (const line of lines) {
        if (shouldCancel()) {
          bot.chat(`${commandName} chat canceled.`)
          break
        }

        bot.chat(line)
        await sleep(150)
      }
    })
  }

  bot.on('spawn', () => {
    log(`${username} joined the world!`)

    loadCraftingData()

    const defaultMoves = new Movements(bot)
    bot.pathfinder.setMovements(defaultMoves)

    bot.chat(`${commandName} online. Combat, mining, and recipe crafting mode active.`)

    markActive('spawn')

    setInterval(() => {
      runAutonomyTick().catch(err => log(`Autonomy loop failure: ${err.message}`))
    }, AUTO_TICK_MS)
  })

  bot.on('chat', async (username, message) => {
    log(`${username}: ${message}`)

    if (username === bot.username) return

    const lower = message.toLowerCase().trim()

    if (lower === 'all drop') {
      await dropAllInventory()
      return
    }

    const prefix = `${commandName.toLowerCase()} `
    if (!lower.startsWith(prefix)) return

    const prompt = message.slice(prefix.length).trim()

    if (!prompt) {
      bot.chat(`Say something like: ${commandName} help`)
      return
    }

    markActive('incoming_command')
    await handleCommand(username, prompt)
  })

  bot.on('path_update', results => {
    log(`Path update: ${results.status}`)
  })

  bot.on('goal_reached', () => {
    log('Goal reached.')
    markActive('goal_reached')
  })

  bot.on('entityHurt', entity => {
    if (entity && entity.id === bot.entity.id) {
      markActive('bot_hurt')
    }
  })

  bot.on('error', err => log(`Bot error: ${err.message || err}`))
  bot.on('end', () => log('Bot disconnected'))
  bot.on('kicked', reason => log(`Bot kicked: ${reason}`))

  return bot
}

module.exports = {
  createWorkerBot
}

```

## BravoBot.js

```js
// Alpha help
// Alpha craft axe
// Alpha craft planks
// Alpha inventory
// Alpha first tool

// Bravo help
// Bravo craft pickaxe
// Bravo inventory

// all drop

const { createWorkerBot } = require('./bots/createWorkerBot')

createWorkerBot({
  username: 'BravoBot',
  commandName: 'Bravo',
  personalityPrompt:
    'You are Bravo, a Minecraft worker bot. Keep replies short, direct, and professional.',
  protectTargetName: 'AlphaBot'
})

```

## data/craftingRecipes.json

```json
{
  "items": {
    "oak_planks": {
      "displayName": "Oak Planks",
      "category": "component",
      "requiresTable": false,
      "outputCount": 4,
      "ingredients": [
        { "item": "oak_log", "count": 1 }
      ]
    },
    "spruce_planks": {
      "displayName": "Spruce Planks",
      "category": "component",
      "requiresTable": false,
      "outputCount": 4,
      "ingredients": [
        { "item": "spruce_log", "count": 1 }
      ]
    },
    "birch_planks": {
      "displayName": "Birch Planks",
      "category": "component",
      "requiresTable": false,
      "outputCount": 4,
      "ingredients": [
        { "item": "birch_log", "count": 1 }
      ]
    },
    "jungle_planks": {
      "displayName": "Jungle Planks",
      "category": "component",
      "requiresTable": false,
      "outputCount": 4,
      "ingredients": [
        { "item": "jungle_log", "count": 1 }
      ]
    },
    "acacia_planks": {
      "displayName": "Acacia Planks",
      "category": "component",
      "requiresTable": false,
      "outputCount": 4,
      "ingredients": [
        { "item": "acacia_log", "count": 1 }
      ]
    },
    "dark_oak_planks": {
      "displayName": "Dark Oak Planks",
      "category": "component",
      "requiresTable": false,
      "outputCount": 4,
      "ingredients": [
        { "item": "dark_oak_log", "count": 1 }
      ]
    },
    "mangrove_planks": {
      "displayName": "Mangrove Planks",
      "category": "component",
      "requiresTable": false,
      "outputCount": 4,
      "ingredients": [
        { "item": "mangrove_log", "count": 1 }
      ]
    },
    "cherry_planks": {
      "displayName": "Cherry Planks",
      "category": "component",
      "requiresTable": false,
      "outputCount": 4,
      "ingredients": [
        { "item": "cherry_log", "count": 1 }
      ]
    },
    "crimson_planks": {
      "displayName": "Crimson Planks",
      "category": "component",
      "requiresTable": false,
      "outputCount": 4,
      "ingredients": [
        { "item": "crimson_stem", "count": 1 }
      ]
    },
    "warped_planks": {
      "displayName": "Warped Planks",
      "category": "component",
      "requiresTable": false,
      "outputCount": 4,
      "ingredients": [
        { "item": "warped_stem", "count": 1 }
      ]
    },

    "stick": {
      "displayName": "Stick",
      "category": "component",
      "requiresTable": false,
      "outputCount": 4,
      "ingredients": [
        { "item": "planks", "count": 2 }
      ]
    },
    "crafting_table": {
      "displayName": "Crafting Table",
      "category": "utility",
      "requiresTable": false,
      "outputCount": 1,
      "ingredients": [
        { "item": "planks", "count": 4 }
      ]
    },
    "wooden_axe": {
      "displayName": "Wooden Axe",
      "category": "tool",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "planks", "count": 3 },
        { "item": "stick", "count": 2 }
      ]
    },
    "wooden_pickaxe": {
      "displayName": "Wooden Pickaxe",
      "category": "tool",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "planks", "count": 3 },
        { "item": "stick", "count": 2 }
      ]
    },
    "wooden_sword": {
      "displayName": "Wooden Sword",
      "category": "weapon",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "planks", "count": 2 },
        { "item": "stick", "count": 1 }
      ]
    },
    "wooden_shovel": {
      "displayName": "Wooden Shovel",
      "category": "tool",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "planks", "count": 1 },
        { "item": "stick", "count": 2 }
      ]
    },
    "wooden_hoe": {
      "displayName": "Wooden Hoe",
      "category": "tool",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "planks", "count": 2 },
        { "item": "stick", "count": 2 }
      ]
    },
    "stone_axe": {
      "displayName": "Stone Axe",
      "category": "tool",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "cobblestone", "count": 3 },
        { "item": "stick", "count": 2 }
      ]
    },
    "stone_pickaxe": {
      "displayName": "Stone Pickaxe",
      "category": "tool",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "cobblestone", "count": 3 },
        { "item": "stick", "count": 2 }
      ]
    },
    "stone_sword": {
      "displayName": "Stone Sword",
      "category": "weapon",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "cobblestone", "count": 2 },
        { "item": "stick", "count": 1 }
      ]
    },
    "iron_axe": {
      "displayName": "Iron Axe",
      "category": "tool",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "iron_ingot", "count": 3 },
        { "item": "stick", "count": 2 }
      ]
    },
    "iron_pickaxe": {
      "displayName": "Iron Pickaxe",
      "category": "tool",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "iron_ingot", "count": 3 },
        { "item": "stick", "count": 2 }
      ]
    },
    "iron_sword": {
      "displayName": "Iron Sword",
      "category": "weapon",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "iron_ingot", "count": 2 },
        { "item": "stick", "count": 1 }
      ]
    },
    "diamond_axe": {
      "displayName": "Diamond Axe",
      "category": "tool",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "diamond", "count": 3 },
        { "item": "stick", "count": 2 }
      ]
    },
    "diamond_pickaxe": {
      "displayName": "Diamond Pickaxe",
      "category": "tool",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "diamond", "count": 3 },
        { "item": "stick", "count": 2 }
      ]
    },
    "diamond_sword": {
      "displayName": "Diamond Sword",
      "category": "weapon",
      "requiresTable": true,
      "outputCount": 1,
      "ingredients": [
        { "item": "diamond", "count": 2 },
        { "item": "stick", "count": 1 }
      ]
    }
  },
  "aliases": {
    "axe": "wooden_axe",
    "pickaxe": "wooden_pickaxe",
    "pick": "wooden_pickaxe",
    "sword": "wooden_sword",
    "shovel": "wooden_shovel",
    "hoe": "wooden_hoe",
    "table": "crafting_table",
    "workbench": "crafting_table"
  },
  "groups": {
    "planks": [
      "oak_planks",
      "spruce_planks",
      "birch_planks",
      "jungle_planks",
      "acacia_planks",
      "dark_oak_planks",
      "mangrove_planks",
      "cherry_planks",
      "crimson_planks",
      "warped_planks"
    ],
    "logs": [
      "oak_log",
      "spruce_log",
      "birch_log",
      "jungle_log",
      "acacia_log",
      "dark_oak_log",
      "mangrove_log",
      "cherry_log",
      "crimson_stem",
      "warped_stem"
    ]
  }
}

```


## package.json

```json
{
  "name": "minecraft-bot",
  "version": "1.0.0",
  "main": "alphaBot.js",
  "scripts": {
    "start": "node alphaBot.js",
    "start:alpha": "node alphaBot.js",
    "start:bravo": "node bravoBot.js",
    "start:all": "start cmd /k node alphaBot.js && start cmd /k node bravoBot.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": "",
  "dependencies": {
    "mineflayer": "^4.35.0",
    "mineflayer-pathfinder": "^2.4.5",
    "ollama": "^0.6.3"
  }
}

```

## utils/teleportOrMoveToPlayer.js

```js
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function teleportOrMoveToPlayer(bot, playerName, moveNearPlayer, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false)
  const announce = options.announce !== false
  const fallbackDistance = options.fallbackDistance ?? 2
  const waitAfterTpMs = options.waitAfterTpMs ?? 700

  const player = bot.players[playerName]
  if (!player || !player.entity) {
    if (announce) {
      bot.chat(`I can't find ${playerName}.`)
    }

    return {
      success: false,
      method: 'none',
      reason: 'player_not_found'
    }
  }

  if (shouldCancel()) {
    return {
      success: false,
      method: 'none',
      reason: 'canceled'
    }
  }

  try {
    bot.chat(`/tp ${bot.username} ${playerName}`)
    await sleep(waitAfterTpMs)
  } catch (err) {
    console.log(`[${bot.username}] Teleport command failed:`, err.message)
  }

  if (shouldCancel()) {
    return {
      success: false,
      method: 'none',
      reason: 'canceled'
    }
  }

  const refreshedPlayer = bot.players[playerName]
  if (refreshedPlayer && refreshedPlayer.entity) {
    const dist = bot.entity.position.distanceTo(refreshedPlayer.entity.position)

    if (dist <= fallbackDistance + 1.5) {
      if (announce) {
        bot.chat('Teleported in.')
      }

      return {
        success: true,
        method: 'teleport',
        reason: 'ok'
      }
    }
  }

  const moved = await moveNearPlayer(playerName, {
    shouldCancel,
    announce,
    distance: fallbackDistance
  })

  return {
    success: !!moved,
    method: moved ? 'walk' : 'none',
    reason: moved ? 'ok' : 'move_failed'
  }
}

module.exports = {
  teleportOrMoveToPlayer
}
```

