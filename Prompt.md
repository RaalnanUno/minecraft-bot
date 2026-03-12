# CodePromptBuilder Project Prompt

I told Delta to craft a crafting table, but it said it was missing planks. Can we have it so that the bot will break down the request to the basic stuff that is missing, and go and get them? Can the bots identify what materials are nearby?

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

function findNearbyLog(bot) {
  return bot.findBlock({
    matching: block => isLogBlock(block),
    maxDistance: 24
  })
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
const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");

const { harvestNearby } = require("./actions/harvestNearby");
const { collectNearbyDrops } = require("./actions/collectDrops");
const { bootstrapFirstTool } = require("./actions/bootstrapFirstTool");

const {
  fightNearestHostile,
  getNearestHostile,
  attackEntity,
} = require("./actions/fightHostiles");
const { teleportOrMoveToPlayer } = require("./utils/teleportOrMoveToPlayer");

const AUTO_TICK_MS = 1500;
const IDLE_WORK_DELAY_MS = 60_000;
const FOLLOW_DISTANCE = 3;
const COME_BACK_DISTANCE = 10;
const DEFEND_RADIUS = 12;
const TREE_COOLDOWN_MS = 12_000;
const HURT_DEFEND_WINDOW_MS = 10_000;

const bot = mineflayer.createBot({
  host: "localhost",
  port: 25565,
  username: "AlphaBot",
  auth: "offline",
});

bot.loadPlugin(pathfinder);

const state = {
  mode: "idle", // idle | moving | harvesting | collecting | fighting | auto_follow | auto_harvest | auto_defend | reporting
  cancelRequested: false,
  leaderName: null,
  autoLoopRunning: false,
  lastTreeAttemptAt: 0,
  lastActiveAt: Date.now(),
  lastHurtAt: 0,
  taskToken: 0,
  followEnabled: true,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setMode(mode) {
  state.mode = mode;
  console.log(`[AlphaBot] Mode set to: ${mode}`);
}

function isBusy() {
  return state.mode !== "idle";
}

function markActive(reason = "activity") {
  state.lastActiveAt = Date.now();
  console.log(`[AlphaBot] Active: ${reason}`);
}

function getIdleMs() {
  return Date.now() - state.lastActiveAt;
}

function nextTaskToken() {
  state.taskToken += 1;
  return state.taskToken;
}

function makeShouldCancel(taskToken) {
  return () => state.cancelRequested || taskToken !== state.taskToken;
}

function clearCancelRequest() {
  state.cancelRequested = false;
}

function hardStopMotion() {
  try {
    bot.pathfinder.setGoal(null);
  } catch (err) {
    console.log("[AlphaBot] Could not clear goal:", err.message);
  }

  try {
    bot.pathfinder.stop();
  } catch (err) {
    console.log("[AlphaBot] Could not stop pathfinder:", err.message);
  }

  try {
    bot.clearControlStates();
  } catch (err) {
    console.log("[AlphaBot] Could not clear control states:", err.message);
  }
}

function interruptCurrentTask(reason = "interrupt") {
  state.cancelRequested = true;
  nextTaskToken();
  hardStopMotion();
  setMode("idle");
  markActive(reason);
}

function finishTask(taskToken) {
  if (taskToken !== state.taskToken) {
    return;
  }

  clearCancelRequest();
  setMode("idle");
  markActive("task_finished");
}

function getPlayerEntity(playerName) {
  if (!playerName) return null;
  const player = bot.players[playerName];
  if (!player) return null;
  return player.entity || null;
}

function getNearestPlayerName() {
  const players = Object.values(bot.players)
    .filter(
      (player) =>
        player &&
        player.username &&
        player.username !== bot.username &&
        player.entity,
    )
    .sort((a, b) => {
      const distA = bot.entity.position.distanceTo(a.entity.position);
      const distB = bot.entity.position.distanceTo(b.entity.position);
      return distA - distB;
    });

  return players[0]?.username || null;
}

function getLeaderName() {
  if (state.leaderName && getPlayerEntity(state.leaderName)) {
    return state.leaderName;
  }

  const nearest = getNearestPlayerName();
  if (nearest) {
    state.leaderName = nearest;
    return nearest;
  }

  return null;
}

function setLeaderName(playerName) {
  state.leaderName = playerName;
  console.log(`[AlphaBot] Leader set to: ${playerName}`);
}

async function moveNearPlayer(playerName, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false)
  const announce = options.announce !== false
  const distance = options.distance || FOLLOW_DISTANCE

  const result = await teleportOrMoveToPlayer(
    bot,
    playerName,
    async (targetPlayerName, moveOptions = {}) => {
      const player = bot.players[targetPlayerName]

      if (!player || !player.entity) {
        if (announce) {
          bot.chat(`I can't find ${targetPlayerName}.`)
        }
        return false
      }

      const target = player.entity.position
      const goal = new goals.GoalNear(
        Math.floor(target.x),
        Math.floor(target.y),
        Math.floor(target.z),
        moveOptions.distance || distance
      )

      if (announce) {
        bot.chat(`Coming to you, ${targetPlayerName}.`)
      }

      await bot.pathfinder.goto(goal)

      if (moveOptions.shouldCancel && moveOptions.shouldCancel()) {
        return false
      }

      if (announce) {
        bot.chat('I am here.')
      }

      return true
    },
    {
      shouldCancel,
      announce,
      fallbackDistance: distance
    }
  )

  return result.success
}

function getInventorySummary() {
  const items = bot.inventory.items();

  if (!items || items.length === 0) {
    return "My inventory is empty.";
  }

  const summary = items
    .slice(0, 8)
    .map((item) => `${item.name} x${item.count}`)
    .join(", ");

  if (items.length > 8) {
    return `I have: ${summary}, and more.`;
  }

  return `I have: ${summary}.`;
}

function getStatusSummary() {
  return `Status: mode=${state.mode}, leader=${state.leaderName || "none"}, follow=${state.followEnabled}, idleMs=${getIdleMs()}`;
}

function showHelp() {
  bot.chat(
    "Commands: help, status, follow me, stay here, come here, harvest, first tool, collect items, fight, stop, inventory",
  );
}

function shouldAutoDefend() {
  return Date.now() - state.lastHurtAt <= HURT_DEFEND_WINDOW_MS;
}

async function runAutonomyTick() {
  if (state.autoLoopRunning) return;
  if (isBusy()) return;

  state.autoLoopRunning = true;

  try {
    const leaderName = getLeaderName();
    const leaderEntity = leaderName ? getPlayerEntity(leaderName) : null;

    const nearbyHostile = getNearestHostile(bot, DEFEND_RADIUS);
    if (
      nearbyHostile &&
      (shouldAutoDefend() ||
        !leaderEntity ||
        bot.entity.position.distanceTo(nearbyHostile.position) <= 6)
    ) {
      const taskToken = nextTaskToken();
      clearCancelRequest();
      setMode("auto_defend");
      markActive("auto_defend_started");

      try {
        await attackEntity(bot, nearbyHostile, {
          shouldCancel: makeShouldCancel(taskToken),
          maxFightTimeMs: 15000,
          announce: false,
        });
      } finally {
        finishTask(taskToken);
      }

      return;
    }

    if (leaderEntity && state.followEnabled) {
      const distanceToLeader = bot.entity.position.distanceTo(
        leaderEntity.position,
      );

      if (distanceToLeader > COME_BACK_DISTANCE) {
        const taskToken = nextTaskToken();
        clearCancelRequest();
        setMode("auto_follow");
        markActive("auto_follow_started");

        try {
          await moveNearPlayer(leaderName, {
            shouldCancel: makeShouldCancel(taskToken),
            announce: false,
            distance: FOLLOW_DISTANCE,
          });
        } finally {
          finishTask(taskToken);
        }

        return;
      }
    }

    if (getIdleMs() < IDLE_WORK_DELAY_MS) {
      return;
    }

const now = Date.now();
if (now - state.lastTreeAttemptAt < TREE_COOLDOWN_MS) {
  return;
}

state.lastTreeAttemptAt = now;

const taskToken = nextTaskToken();
clearCancelRequest();
setMode("auto_harvest");
markActive("auto_harvest_started");

try {
  await harvestNearby(bot, {
    shouldCancel: makeShouldCancel(taskToken),
    autoCollect: true,
    announce: false,
    maxBlocks: 10,
    scanDistance: 6
  });
} finally {
  finishTask(taskToken);
}
  } catch (err) {
    console.error("[AlphaBot] Autonomy tick error:", err);
    setMode("idle");
    clearCancelRequest();
  } finally {
    state.autoLoopRunning = false;
  }
}

async function runCommandTask(mode, reason, runner) {
  interruptCurrentTask(reason);
  await sleep(100);

  const taskToken = nextTaskToken();
  clearCancelRequest();
  setMode(mode);
  markActive(`${mode}_started`);

  try {
    await runner({
      taskToken,
      shouldCancel: makeShouldCancel(taskToken),
    });
  } finally {
    finishTask(taskToken);
  }
}

async function handleCommand(username, prompt) {
  const normalized = prompt.toLowerCase().trim();
  setLeaderName(username);

  if (normalized === "help" || normalized === "commands") {
    interruptCurrentTask("help_command");
    showHelp();
    return;
  }

  if (normalized === "status") {
    interruptCurrentTask("status_command");
    bot.chat(getStatusSummary());
    return;
  }

  if (normalized === "stop" || normalized === "cancel") {
    interruptCurrentTask("stop_command");
    bot.chat("Stopping now.");
    return;
  }

  if (normalized === "inventory" || normalized === "what do you have") {
    await runCommandTask("reporting", "inventory_command", async () => {
      bot.chat(getInventorySummary());
    });
    return;
  }

  if (normalized === "follow me") {
    interruptCurrentTask("follow_command");
    state.followEnabled = true;
    bot.chat(`Okay ${username}, I will stay with you.`);
    return;
  }

  if (normalized === "stay here") {
    interruptCurrentTask("stay_here_command");
    state.followEnabled = false;
    bot.chat("Okay. I will hold here until you call me.");
    return;
  }

  if (normalized === "come here") {
    state.followEnabled = true;

    await runCommandTask(
      "moving",
      "come_here_command",
      async ({ shouldCancel }) => {
        try {
          await moveNearPlayer(username, {
            shouldCancel,
            announce: true,
            distance: 1,
          });
        } catch (err) {
          console.error("[AlphaBot] Movement error:", err);
          bot.chat("I had trouble getting to you.");
        }
      },
    );
    return;
  }

  if (
    normalized === "fight" ||
    normalized === "attack mob" ||
    normalized === "attack mobs"
  ) {
    await runCommandTask(
      "fighting",
      "fight_command",
      async ({ shouldCancel }) => {
        try {
          await fightNearestHostile(bot, {
            shouldCancel,
          });
        } catch (err) {
          console.error("[AlphaBot] Fight error:", err);
          bot.chat("I had trouble fighting the hostile mob.");
        }
      },
    );
    return;
  }

  if (normalized === "collect items" || normalized === "pick up items") {
    await runCommandTask(
      "collecting",
      "collect_command",
      async ({ shouldCancel }) => {
        try {
          await collectNearbyDrops(bot, {
            shouldCancel,
          });
        } catch (err) {
          console.error("[AlphaBot] Collect items error:", err);
          bot.chat("I had trouble collecting items.");
        }
      },
    );
    return;
  }

  if (
    normalized === "first tool" ||
    normalized === "bootstrap" ||
    normalized === "make first tool"
  ) {
    await runCommandTask(
      "harvesting",
      "bootstrap_first_tool_command",
      async ({ shouldCancel }) => {
        try {
          const result = await bootstrapFirstTool(bot, {
            shouldCancel,
            announce: true,
            preferredTool: "wooden_axe"
          });

          console.log("[AlphaBot] bootstrapFirstTool result:", result);

          if (!result.success && !result.canceled) {
            bot.chat(`I could not finish making my first tool. Reason: ${result.reason}`);
          }
        } catch (err) {
          console.error("[AlphaBot] bootstrapFirstTool error:", err);
          bot.chat(`I had trouble bootstrapping my first tool: ${err.message}`);
        }
      }
    );
    return;
  }

  if (
    normalized === "harvest" ||
    normalized === "harvest nearby" ||
    normalized === "cut tree" ||
    normalized === "cut trees" ||
    normalized === "harvest trees"
  ) {
    await runCommandTask(
      "harvesting",
      "harvest_command",
      async ({ shouldCancel }) => {
        try {
          state.lastTreeAttemptAt = Date.now();

          const result = await harvestNearby(bot, {
            shouldCancel,
            autoCollect: true,
            announce: true,
            maxBlocks: 12,
            scanDistance: 6
          });

          console.log("[AlphaBot] harvestNearby result:", result);
        } catch (err) {
          console.error("[AlphaBot] Harvest error:", err);
          bot.chat(`I had trouble harvesting nearby blocks: ${err.message}`);
        }
      }
    );
    return;
  }

  bot.chat('Unknown command. Say "AlphaBot help".');
}

bot.on("spawn", () => {
  console.log("AlphaBot joined the world!");

  const defaultMoves = new Movements(bot);
  bot.pathfinder.setMovements(defaultMoves);

bot.chat(
  "AlphaBot online. I will harvest nearby blocks, collect drops, defend myself, and regroup with you."
)

  markActive("spawn");

  setInterval(() => {
    runAutonomyTick().catch((err) =>
      console.error("[AlphaBot] Autonomy loop failure:", err),
    );
  }, AUTO_TICK_MS);
});

bot.on("chat", async (username, message) => {
  console.log(`[AlphaBot] ${username}: ${message}`);

  if (username === bot.username) return;

  const lower = message.toLowerCase();

  if (!lower.startsWith("lumberjack ")) return;

  const prompt = message.slice("lumberjack ".length).trim();

  if (!prompt) {
    bot.chat("Say something like: AlphaBot help");
    return;
  }

  markActive("incoming_command");
  await handleCommand(username, prompt);
});

bot.on("path_update", (results) => {
  console.log(`[AlphaBot] Path update: ${results.status}`);
});

bot.on("goal_reached", () => {
  console.log("[AlphaBot] Goal reached.");
  markActive("goal_reached");
});

bot.on("entityHurt", (entity) => {
  if (entity && bot.entity && entity.id === bot.entity.id) {
    state.lastHurtAt = Date.now();
    markActive("bot_hurt");
  }
});

bot.on("error", (err) => console.log("[AlphaBot] Bot error:", err));
bot.on("end", () => console.log("[AlphaBot] Bot disconnected"));
bot.on("kicked", (reason) => console.log("[AlphaBot] Bot kicked:", reason));

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

## BravoBot.js

```js
const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");

const { harvestNearby } = require("./actions/harvestNearby");
const { collectNearbyDrops } = require("./actions/collectDrops");
const { bootstrapFirstTool } = require("./actions/bootstrapFirstTool");

const {
  fightNearestHostile,
  getNearestHostile,
  attackEntity,
} = require("./actions/fightHostiles");
const { teleportOrMoveToPlayer } = require("./utils/teleportOrMoveToPlayer");

const AUTO_TICK_MS = 1500;
const IDLE_WORK_DELAY_MS = 60_000;
const FOLLOW_DISTANCE = 3;
const COME_BACK_DISTANCE = 10;
const DEFEND_RADIUS = 12;
const TREE_COOLDOWN_MS = 12_000;
const HURT_DEFEND_WINDOW_MS = 10_000;

const bot = mineflayer.createBot({
  host: "localhost",
  port: 25565,
  username: "BravoBot",
  auth: "offline",
});

bot.loadPlugin(pathfinder);

const state = {
  mode: "idle", // idle | moving | harvesting | collecting | fighting | auto_follow | auto_harvest | auto_defend | reporting
  cancelRequested: false,
  leaderName: null,
  autoLoopRunning: false,
  lastTreeAttemptAt: 0,
  lastActiveAt: Date.now(),
  lastHurtAt: 0,
  taskToken: 0,
  followEnabled: true,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setMode(mode) {
  state.mode = mode;
  console.log(`[BravoBot] Mode set to: ${mode}`);
}

function isBusy() {
  return state.mode !== "idle";
}

function markActive(reason = "activity") {
  state.lastActiveAt = Date.now();
  console.log(`[BravoBot] Active: ${reason}`);
}

function getIdleMs() {
  return Date.now() - state.lastActiveAt;
}

function nextTaskToken() {
  state.taskToken += 1;
  return state.taskToken;
}

function makeShouldCancel(taskToken) {
  return () => state.cancelRequested || taskToken !== state.taskToken;
}

function clearCancelRequest() {
  state.cancelRequested = false;
}

function hardStopMotion() {
  try {
    bot.pathfinder.setGoal(null);
  } catch (err) {
    console.log("[BravoBot] Could not clear goal:", err.message);
  }

  try {
    bot.pathfinder.stop();
  } catch (err) {
    console.log("[BravoBot] Could not stop pathfinder:", err.message);
  }

  try {
    bot.clearControlStates();
  } catch (err) {
    console.log("[BravoBot] Could not clear control states:", err.message);
  }
}

function interruptCurrentTask(reason = "interrupt") {
  state.cancelRequested = true;
  nextTaskToken();
  hardStopMotion();
  setMode("idle");
  markActive(reason);
}

function finishTask(taskToken) {
  if (taskToken !== state.taskToken) {
    return;
  }

  clearCancelRequest();
  setMode("idle");
  markActive("task_finished");
}

function getPlayerEntity(playerName) {
  if (!playerName) return null;
  const player = bot.players[playerName];
  if (!player) return null;
  return player.entity || null;
}

function getNearestPlayerName() {
  const players = Object.values(bot.players)
    .filter(
      (player) =>
        player &&
        player.username &&
        player.username !== bot.username &&
        player.entity,
    )
    .sort((a, b) => {
      const distA = bot.entity.position.distanceTo(a.entity.position);
      const distB = bot.entity.position.distanceTo(b.entity.position);
      return distA - distB;
    });

  return players[0]?.username || null;
}

function getLeaderName() {
  if (state.leaderName && getPlayerEntity(state.leaderName)) {
    return state.leaderName;
  }

  const nearest = getNearestPlayerName();
  if (nearest) {
    state.leaderName = nearest;
    return nearest;
  }

  return null;
}

function setLeaderName(playerName) {
  state.leaderName = playerName;
  console.log(`[BravoBot] Leader set to: ${playerName}`);
}

async function moveNearPlayer(playerName, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false)
  const announce = options.announce !== false
  const distance = options.distance || FOLLOW_DISTANCE

  const result = await teleportOrMoveToPlayer(
    bot,
    playerName,
    async (targetPlayerName, moveOptions = {}) => {
      const player = bot.players[targetPlayerName]

      if (!player || !player.entity) {
        if (announce) {
          bot.chat(`I can't find ${targetPlayerName}.`)
        }
        return false
      }

      const target = player.entity.position
      const goal = new goals.GoalNear(
        Math.floor(target.x),
        Math.floor(target.y),
        Math.floor(target.z),
        moveOptions.distance || distance
      )

      if (announce) {
        bot.chat(`Coming to you, ${targetPlayerName}.`)
      }

      await bot.pathfinder.goto(goal)

      if (moveOptions.shouldCancel && moveOptions.shouldCancel()) {
        return false
      }

      if (announce) {
        bot.chat('I am here.')
      }

      return true
    },
    {
      shouldCancel,
      announce,
      fallbackDistance: distance
    }
  )

  return result.success
}

function getInventorySummary() {
  const items = bot.inventory.items();

  if (!items || items.length === 0) {
    return "My inventory is empty.";
  }

  const summary = items
    .slice(0, 8)
    .map((item) => `${item.name} x${item.count}`)
    .join(", ");

  if (items.length > 8) {
    return `I have: ${summary}, and more.`;
  }

  return `I have: ${summary}.`;
}

function getStatusSummary() {
  return `Status: mode=${state.mode}, leader=${state.leaderName || "none"}, follow=${state.followEnabled}, idleMs=${getIdleMs()}`;
}

function showHelp() {
  bot.chat(
    "Commands: help, status, follow me, stay here, come here, harvest, first tool, collect items, fight, stop, inventory",
  );
}

function shouldAutoDefend() {
  return Date.now() - state.lastHurtAt <= HURT_DEFEND_WINDOW_MS;
}

async function runAutonomyTick() {
  if (state.autoLoopRunning) return;
  if (isBusy()) return;

  state.autoLoopRunning = true;

  try {
    const leaderName = getLeaderName();
    const leaderEntity = leaderName ? getPlayerEntity(leaderName) : null;

    const nearbyHostile = getNearestHostile(bot, DEFEND_RADIUS);
    if (
      nearbyHostile &&
      (shouldAutoDefend() ||
        !leaderEntity ||
        bot.entity.position.distanceTo(nearbyHostile.position) <= 6)
    ) {
      const taskToken = nextTaskToken();
      clearCancelRequest();
      setMode("auto_defend");
      markActive("auto_defend_started");

      try {
        await attackEntity(bot, nearbyHostile, {
          shouldCancel: makeShouldCancel(taskToken),
          maxFightTimeMs: 15000,
          announce: false,
        });
      } finally {
        finishTask(taskToken);
      }

      return;
    }

    if (leaderEntity && state.followEnabled) {
      const distanceToLeader = bot.entity.position.distanceTo(
        leaderEntity.position,
      );

      if (distanceToLeader > COME_BACK_DISTANCE) {
        const taskToken = nextTaskToken();
        clearCancelRequest();
        setMode("auto_follow");
        markActive("auto_follow_started");

        try {
          await moveNearPlayer(leaderName, {
            shouldCancel: makeShouldCancel(taskToken),
            announce: false,
            distance: FOLLOW_DISTANCE,
          });
        } finally {
          finishTask(taskToken);
        }

        return;
      }
    }

    if (getIdleMs() < IDLE_WORK_DELAY_MS) {
      return;
    }

const now = Date.now();
if (now - state.lastTreeAttemptAt < TREE_COOLDOWN_MS) {
  return;
}

state.lastTreeAttemptAt = now;

const taskToken = nextTaskToken();
clearCancelRequest();
setMode("auto_harvest");
markActive("auto_harvest_started");

try {
  await harvestNearby(bot, {
    shouldCancel: makeShouldCancel(taskToken),
    autoCollect: true,
    announce: false,
    maxBlocks: 10,
    scanDistance: 6
  });
} finally {
  finishTask(taskToken);
}
  } catch (err) {
    console.error("[BravoBot] Autonomy tick error:", err);
    setMode("idle");
    clearCancelRequest();
  } finally {
    state.autoLoopRunning = false;
  }
}

async function runCommandTask(mode, reason, runner) {
  interruptCurrentTask(reason);
  await sleep(100);

  const taskToken = nextTaskToken();
  clearCancelRequest();
  setMode(mode);
  markActive(`${mode}_started`);

  try {
    await runner({
      taskToken,
      shouldCancel: makeShouldCancel(taskToken),
    });
  } finally {
    finishTask(taskToken);
  }
}

async function handleCommand(username, prompt) {
  const normalized = prompt.toLowerCase().trim();
  setLeaderName(username);

  if (normalized === "help" || normalized === "commands") {
    interruptCurrentTask("help_command");
    showHelp();
    return;
  }

  if (normalized === "status") {
    interruptCurrentTask("status_command");
    bot.chat(getStatusSummary());
    return;
  }

  if (normalized === "stop" || normalized === "cancel") {
    interruptCurrentTask("stop_command");
    bot.chat("Stopping now.");
    return;
  }

  if (normalized === "inventory" || normalized === "what do you have") {
    await runCommandTask("reporting", "inventory_command", async () => {
      bot.chat(getInventorySummary());
    });
    return;
  }

  if (normalized === "follow me") {
    interruptCurrentTask("follow_command");
    state.followEnabled = true;
    bot.chat(`Okay ${username}, I will stay with you.`);
    return;
  }

  if (normalized === "stay here") {
    interruptCurrentTask("stay_here_command");
    state.followEnabled = false;
    bot.chat("Okay. I will hold here until you call me.");
    return;
  }

  if (normalized === "come here") {
    state.followEnabled = true;

    await runCommandTask(
      "moving",
      "come_here_command",
      async ({ shouldCancel }) => {
        try {
          await moveNearPlayer(username, {
            shouldCancel,
            announce: true,
            distance: 1,
          });
        } catch (err) {
          console.error("[BravoBot] Movement error:", err);
          bot.chat("I had trouble getting to you.");
        }
      },
    );
    return;
  }

  if (
    normalized === "fight" ||
    normalized === "attack mob" ||
    normalized === "attack mobs"
  ) {
    await runCommandTask(
      "fighting",
      "fight_command",
      async ({ shouldCancel }) => {
        try {
          await fightNearestHostile(bot, {
            shouldCancel,
          });
        } catch (err) {
          console.error("[BravoBot] Fight error:", err);
          bot.chat("I had trouble fighting the hostile mob.");
        }
      },
    );
    return;
  }

  if (normalized === "collect items" || normalized === "pick up items") {
    await runCommandTask(
      "collecting",
      "collect_command",
      async ({ shouldCancel }) => {
        try {
          await collectNearbyDrops(bot, {
            shouldCancel,
          });
        } catch (err) {
          console.error("[BravoBot] Collect items error:", err);
          bot.chat("I had trouble collecting items.");
        }
      },
    );
    return;
  }

  if (
    normalized === "first tool" ||
    normalized === "bootstrap" ||
    normalized === "make first tool"
  ) {
    await runCommandTask(
      "harvesting",
      "bootstrap_first_tool_command",
      async ({ shouldCancel }) => {
        try {
          const result = await bootstrapFirstTool(bot, {
            shouldCancel,
            announce: true,
            preferredTool: "wooden_axe"
          });

          console.log("[BravoBot] bootstrapFirstTool result:", result);

          if (!result.success && !result.canceled) {
            bot.chat(`I could not finish making my first tool. Reason: ${result.reason}`);
          }
        } catch (err) {
          console.error("[BravoBot] bootstrapFirstTool error:", err);
          bot.chat(`I had trouble bootstrapping my first tool: ${err.message}`);
        }
      }
    );
    return;
  }

  if (
    normalized === "harvest" ||
    normalized === "harvest nearby" ||
    normalized === "cut tree" ||
    normalized === "cut trees" ||
    normalized === "harvest trees"
  ) {
    await runCommandTask(
      "harvesting",
      "harvest_command",
      async ({ shouldCancel }) => {
        try {
          state.lastTreeAttemptAt = Date.now();

          const result = await harvestNearby(bot, {
            shouldCancel,
            autoCollect: true,
            announce: true,
            maxBlocks: 12,
            scanDistance: 6
          });

          console.log("[BravoBot] harvestNearby result:", result);
        } catch (err) {
          console.error("[BravoBot] Harvest error:", err);
          bot.chat(`I had trouble harvesting nearby blocks: ${err.message}`);
        }
      }
    );
    return;
  }

  bot.chat('Unknown command. Say "BravoBot help".');
}

bot.on("spawn", () => {
  console.log("BravoBot joined the world!");

  const defaultMoves = new Movements(bot);
  bot.pathfinder.setMovements(defaultMoves);

bot.chat(
  "BravoBot online. I will harvest nearby blocks, collect drops, defend myself, and regroup with you."
)

  markActive("spawn");

  setInterval(() => {
    runAutonomyTick().catch((err) =>
      console.error("[BravoBot] Autonomy loop failure:", err),
    );
  }, AUTO_TICK_MS);
});

bot.on("chat", async (username, message) => {
  console.log(`[BravoBot] ${username}: ${message}`);

  if (username === bot.username) return;

  const lower = message.toLowerCase();

  if (!lower.startsWith("lumberjack ")) return;

  const prompt = message.slice("lumberjack ".length).trim();

  if (!prompt) {
    bot.chat("Say something like: BravoBot help");
    return;
  }

  markActive("incoming_command");
  await handleCommand(username, prompt);
});

bot.on("path_update", (results) => {
  console.log(`[BravoBot] Path update: ${results.status}`);
});

bot.on("goal_reached", () => {
  console.log("[BravoBot] Goal reached.");
  markActive("goal_reached");
});

bot.on("entityHurt", (entity) => {
  if (entity && bot.entity && entity.id === bot.entity.id) {
    state.lastHurtAt = Date.now();
    markActive("bot_hurt");
  }
});

bot.on("error", (err) => console.log("[BravoBot] Bot error:", err));
bot.on("end", () => console.log("[BravoBot] Bot disconnected"));
bot.on("kicked", (reason) => console.log("[BravoBot] Bot kicked:", reason));

```

## charlieBot.js

```js
// charlie first tool
// charlie craft axe
// charlie craft pickaxe
// charlie craft sword
// charlie craft shovel
// charlie craft hoe
// charlie craft wooden_axe
// charlie craft wooden_pickaxe
// charlie craft first
// charlie craft second
// charlie craft third
// charlie craft 1
// charlie craft 2
// charlie craft 3

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const { cutTree } = require('./actions/cutTree')
const { collectNearbyDrops } = require('./actions/collectDrops')
const { bootstrapFirstTool } = require('./actions/bootstrapFirstTool')
const {
  fightNearestHostile,
  getNearestHostile,
  getNearestHostileNearPlayer,
  attackEntity
} = require('./actions/fightHostiles')
const { teleportOrMoveToPlayer } = require('./utils/teleportOrMoveToPlayer')

const OLLAMA_URL = 'http://localhost:11434/api/chat'
const OLLAMA_MODEL = 'llama3.2'

const AUTO_TICK_MS = 1500
const IDLE_WORK_DELAY_MS = 10_000
const FOLLOW_DISTANCE = 4
const COME_BACK_DISTANCE = 10
const DEFEND_RADIUS = 12
const TREE_COOLDOWN_MS = 10_000
const HURT_DEFEND_WINDOW_MS = 10_000
const BRAVO_NAME = 'BravoBot'
const BRAVO_PROTECT_DISTANCE = 3

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'GathererBot',
  auth: 'offline'
})

bot.loadPlugin(pathfinder)

const state = {
  mode: 'idle', // idle | moving | harvesting | collecting | fighting | crafting | chatting | auto_follow | auto_gather | auto_support | auto_defend | reporting
  cancelRequested: false,
  leaderName: null,
  autoLoopRunning: false,
  lastTreeAttemptAt: 0,
  lastActiveAt: Date.now(),
  lastHurtAt: 0,
  taskToken: 0,
  followEnabled: true
}

const TOOL_ALIASES = {
  axe: 'wooden_axe',
  hatchet: 'wooden_axe',
  pickaxe: 'wooden_pickaxe',
  pick: 'wooden_pickaxe',
  sword: 'wooden_sword',
  shovel: 'wooden_shovel',
  spade: 'wooden_shovel',
  hoe: 'wooden_hoe',

  wooden_axe: 'wooden_axe',
  wooden_pickaxe: 'wooden_pickaxe',
  wooden_sword: 'wooden_sword',
  wooden_shovel: 'wooden_shovel',
  wooden_hoe: 'wooden_hoe'
}

const TOOL_ORDER = [
  'wooden_axe',
  'wooden_pickaxe',
  'wooden_sword',
  'wooden_shovel',
  'wooden_hoe'
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function setMode(mode) {
  state.mode = mode
  console.log(`[Charlie] Mode set to: ${mode}`)
}

function isBusy() {
  return state.mode !== 'idle'
}

function markActive(reason = 'activity') {
  state.lastActiveAt = Date.now()
  console.log(`[Charlie] Active: ${reason}`)
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
    console.log('[Charlie] Could not clear goal:', err.message)
  }

  try {
    bot.pathfinder.stop()
  } catch (err) {
    console.log('[Charlie] Could not stop pathfinder:', err.message)
  }

  try {
    bot.clearControlStates()
  } catch (err) {
    console.log('[Charlie] Could not clear control states:', err.message)
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
    .filter(
      player =>
        player &&
        player.username &&
        player.username !== bot.username &&
        player.entity
    )
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
  console.log(`[Charlie] Leader set to: ${playerName}`)
}

function getBravoEntity() {
  return getPlayerEntity(BRAVO_NAME)
}

function getInventorySummary() {
  const items = bot.inventory.items()

  if (!items || items.length === 0) {
    return 'Charlie inventory is empty.'
  }

  const summary = items
    .slice(0, 8)
    .map(item => `${item.name} x${item.count}`)
    .join(', ')

  if (items.length > 8) {
    return `Charlie has: ${summary}, and more.`
  }

  return `Charlie has: ${summary}.`
}

function getStatusSummary() {
  return `Status: mode=${state.mode}, leader=${state.leaderName || 'none'}, follow=${state.followEnabled}, idleMs=${getIdleMs()}`
}

function showHelp() {
  bot.chat(
    'Charlie commands: help, status, follow me, stay here, come here, harvest, cut tree, collect items, fight, inventory, first tool, craft axe, craft pickaxe, craft sword, craft shovel, craft hoe, craft first, craft second, craft third, stop'
  )
}

function shouldAutoDefend() {
  return Date.now() - state.lastHurtAt <= HURT_DEFEND_WINDOW_MS
}

function normalizeCraftTarget(rawPrompt) {
  const normalized = rawPrompt.toLowerCase().trim()

  if (!normalized.startsWith('craft ')) {
    return null
  }

  let requested = normalized.slice('craft '.length).trim()

  if (!requested) {
    return null
  }

  requested = requested
    .replace(/^a\s+/, '')
    .replace(/^an\s+/, '')
    .replace(/^the\s+/, '')
    .trim()

  if (requested === 'first') return TOOL_ORDER[0]
  if (requested === 'second') return TOOL_ORDER[1]
  if (requested === 'third') return TOOL_ORDER[2]
  if (requested === 'fourth') return TOOL_ORDER[3]
  if (requested === 'fifth') return TOOL_ORDER[4]

  if (/^\d+$/.test(requested)) {
    const index = Number(requested) - 1
    if (index >= 0 && index < TOOL_ORDER.length) {
      return TOOL_ORDER[index]
    }
  }

  return TOOL_ALIASES[requested] || null
}

function getCraftHelpText() {
  return 'Craft options: axe, pickaxe, sword, shovel, hoe, or craft first/second/third.'
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
            'You are Charlie, a Minecraft gatherer, support fighter, and basic tool crafter. Keep replies short, practical, and friendly.'
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

  const result = await teleportOrMoveToPlayer(
    bot,
    playerName,
    async (targetPlayerName, moveOptions = {}) => {
      const player = bot.players[targetPlayerName]

      if (!player || !player.entity) {
        if (announce) {
          bot.chat(`Charlie can't find ${targetPlayerName}.`)
        }
        return false
      }

      const target = player.entity.position
      const goal = new goals.GoalNear(
        Math.floor(target.x),
        Math.floor(target.y),
        Math.floor(target.z),
        moveOptions.distance || distance
      )

      if (announce) {
        bot.chat(`Charlie moving to ${targetPlayerName}.`)
      }

      await bot.pathfinder.goto(goal)

      if (moveOptions.shouldCancel && moveOptions.shouldCancel()) {
        return false
      }

      if (announce) {
        bot.chat('Charlie is here.')
      }

      return true
    },
    {
      shouldCancel,
      announce,
      fallbackDistance: distance
    }
  )

  return result.success
}

function getNearestDangerForTeam() {
  const bravo = getBravoEntity()
  if (bravo) {
    const hostileNearBravo = getNearestHostileNearPlayer(bot, BRAVO_NAME, DEFEND_RADIUS)
    if (hostileNearBravo) {
      return hostileNearBravo
    }
  }

  const leaderName = getLeaderName()
  if (leaderName) {
    const hostileNearLeader = getNearestHostileNearPlayer(bot, leaderName, DEFEND_RADIUS)
    if (hostileNearLeader) {
      return hostileNearLeader
    }
  }

  return getNearestHostile(bot, DEFEND_RADIUS)
}

async function supportBravoAgainstThreat(taskToken, hostile) {
  const shouldCancel = makeShouldCancel(taskToken)

  const bravo = getBravoEntity()
  if (!bravo) {
    return
  }

  await moveNearPlayer(BRAVO_NAME, {
    shouldCancel,
    announce: false,
    distance: BRAVO_PROTECT_DISTANCE
  })

  if (shouldCancel()) {
    return
  }

  const freshHostile = bot.entities[hostile.id]
  if (!freshHostile) {
    return
  }

  await attackEntity(bot, freshHostile, {
    shouldCancel,
    maxFightTimeMs: 12000,
    announce: false
  })
}

async function runAutonomyTick() {
  if (state.autoLoopRunning) return
  if (isBusy()) return

  state.autoLoopRunning = true

  try {
    const leaderName = getLeaderName()
    const leaderEntity = leaderName ? getPlayerEntity(leaderName) : null
    const bravoEntity = getBravoEntity()

    const nearbyHostile = getNearestDangerForTeam()
    if (
      nearbyHostile &&
      (shouldAutoDefend() ||
        !leaderEntity ||
        bot.entity.position.distanceTo(nearbyHostile.position) <= 6)
    ) {
      const taskToken = nextTaskToken()
      clearCancelRequest()
      setMode('auto_defend')
      markActive('auto_defend_started')

      try {
        if (bravoEntity) {
          await supportBravoAgainstThreat(taskToken, nearbyHostile)
        } else {
          await attackEntity(bot, nearbyHostile, {
            shouldCancel: makeShouldCancel(taskToken),
            maxFightTimeMs: 12000,
            announce: false
          })
        }
      } finally {
        finishTask(taskToken)
      }

      return
    }

    if (leaderEntity && state.followEnabled) {
      const distanceToLeader = bot.entity.position.distanceTo(leaderEntity.position)

      if (distanceToLeader > COME_BACK_DISTANCE) {
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
    setMode('auto_gather')
    markActive('auto_gather_started')

    try {
      await cutTree(bot, {
        shouldCancel: makeShouldCancel(taskToken),
        autoHarvest: true,
        announce: false
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
    console.error('[Charlie] Autonomy tick error:', err)
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

async function handleCraftCommand(prompt) {
  const craftTarget = normalizeCraftTarget(prompt)

  if (!craftTarget) {
    bot.chat(getCraftHelpText())
    return
  }

  await runCommandTask('crafting', 'craft_command', async ({ shouldCancel }) => {
    try {
      const result = await bootstrapFirstTool(bot, {
        shouldCancel,
        announce: true,
        preferredTool: craftTarget
      })

      console.log('[Charlie] bootstrapFirstTool result:', result)

      if (!result.success && !result.canceled) {
        bot.chat(`Charlie could not craft ${craftTarget}. Reason: ${result.reason}`)
      }
    } catch (err) {
      console.error('[Charlie] Craft error:', err)
      bot.chat(`Charlie had trouble crafting ${craftTarget}: ${err.message}`)
    }
  })
}

async function handleCommand(username, prompt) {
  const normalized = prompt.toLowerCase().trim()
  setLeaderName(username)

  if (normalized === 'help' || normalized === 'commands') {
    interruptCurrentTask('help_command')
    showHelp()
    return
  }

  if (normalized === 'status') {
    interruptCurrentTask('status_command')
    bot.chat(getStatusSummary())
    return
  }

  if (normalized === 'stop' || normalized === 'stay' || normalized === 'cancel') {
    interruptCurrentTask('stop_command')
    bot.chat('Charlie standing by.')
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
    state.followEnabled = true
    bot.chat(`Charlie will stay with you, ${username}.`)
    return
  }

  if (normalized === 'stay here') {
    interruptCurrentTask('stay_here_command')
    state.followEnabled = false
    bot.chat('Charlie will hold here until called.')
    return
  }

  if (normalized === 'come here') {
    state.followEnabled = true

    await runCommandTask('moving', 'come_here_command', async ({ shouldCancel }) => {
      try {
        await moveNearPlayer(username, {
          shouldCancel,
          announce: true,
          distance: 1
        })
      } catch (err) {
        console.error('[Charlie] Movement error:', err)
        bot.chat('Charlie had trouble reaching you.')
      }
    })
    return
  }

  if (
    normalized === 'fight' ||
    normalized === 'attack mob' ||
    normalized === 'attack mobs'
  ) {
    await runCommandTask('fighting', 'fight_command', async ({ shouldCancel }) => {
      try {
        await fightNearestHostile(bot, {
          shouldCancel
        })
      } catch (err) {
        console.error('[Charlie] Fight error:', err)
        bot.chat('Charlie had trouble fighting the hostile mob.')
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
        console.error('[Charlie] Collect items error:', err)
        bot.chat('Charlie had trouble collecting items.')
      }
    })
    return
  }

  if (
    normalized === 'first tool' ||
    normalized === 'bootstrap' ||
    normalized === 'make first tool'
  ) {
    await runCommandTask('crafting', 'bootstrap_first_tool_command', async ({ shouldCancel }) => {
      try {
        const result = await bootstrapFirstTool(bot, {
          shouldCancel,
          announce: true,
          preferredTool: 'wooden_axe'
        })

        console.log('[Charlie] bootstrapFirstTool result:', result)

        if (!result.success && !result.canceled) {
          bot.chat(`Charlie could not finish the first tool. Reason: ${result.reason}`)
        }
      } catch (err) {
        console.error('[Charlie] bootstrapFirstTool error:', err)
        bot.chat(`Charlie had trouble making the first tool: ${err.message}`)
      }
    })
    return
  }

  if (normalized.startsWith('craft ')) {
    await handleCraftCommand(normalized)
    return
  }

  if (
    normalized === 'harvest' ||
    normalized === 'harvest nearby' ||
    normalized === 'cut tree' ||
    normalized === 'cut trees' ||
    normalized === 'harvest trees'
  ) {
    await runCommandTask('harvesting', 'harvest_command', async ({ shouldCancel }) => {
      try {
        state.lastTreeAttemptAt = Date.now()

        await cutTree(bot, {
          shouldCancel,
          autoHarvest: true,
          announce: true
        })
      } catch (err) {
        console.error('[Charlie] Harvest error:', err)
        bot.chat(`Charlie had trouble harvesting: ${err.message}`)
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
          bot.chat('Charlie chat canceled.')
          break
        }

        bot.chat(line)
        await sleep(150)
      }
    } catch (err) {
      console.error('[Charlie] Ollama error:', err)
      bot.chat('Charlie could not reach Ollama.')
    }
  })
}

bot.on('spawn', () => {
  console.log('GathererBot joined the world!')

  const defaultMoves = new Movements(bot)
  bot.pathfinder.setMovements(defaultMoves)

  bot.chat('Charlie online. Gathering, support, defense, and basic crafting active.')

  markActive('spawn')

  setInterval(() => {
    runAutonomyTick().catch(err => console.error('[Charlie] Autonomy loop failure:', err))
  }, AUTO_TICK_MS)
})

bot.on('chat', async (username, message) => {
  console.log(`[Charlie] ${username}: ${message}`)

  if (username === bot.username) return

  const lower = message.toLowerCase()

  if (!lower.startsWith('charlie ')) return

  const prompt = message.slice(8).trim()

  if (!prompt) {
    bot.chat('Say something like: Charlie help')
    return
  }

  markActive('incoming_command')
  await handleCommand(username, prompt)
})

bot.on('path_update', results => {
  console.log(`[Charlie] Path update: ${results.status}`)
})

bot.on('goal_reached', () => {
  console.log('[Charlie] Goal reached.')
  markActive('goal_reached')
})

bot.on('entityHurt', entity => {
  if (entity && entity.id === bot.entity.id) {
    state.lastHurtAt = Date.now()
    markActive('bot_hurt')
  }
})

bot.on('error', err => console.log('[Charlie] Bot error:', err))
bot.on('end', () => console.log('[Charlie] Bot disconnected'))
bot.on('kicked', reason => console.log('[Charlie] Bot kicked:', reason))
```

## data/craftingRecipes.json

```json
{
  "items": {
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

## deltaBot.js

```js

// Delta help
// Delta recipe stick
// Delta recipe diamond axe
// Delta craft stick
// Delta craft crafting table
// Delta craft wooden axe
// Delta craft diamond axe
// Delta first tool

const fs = require('fs')
const path = require('path')
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { mineStone } = require('./actions/mineStone')
const { collectNearbyDrops } = require('./actions/collectDrops')
const { bootstrapFirstTool } = require('./actions/bootstrapFirstTool')
const {
  fightNearestHostile,
  getNearestHostile,
  attackEntity
} = require('./actions/fightHostiles')

const OLLAMA_URL = 'http://localhost:11434/api/chat'
const OLLAMA_MODEL = 'llama3.2'

const AUTO_TICK_MS = 1200
const IDLE_WORK_DELAY_MS = 5000
const FOLLOW_DISTANCE = 3
const ENGAGE_RADIUS = 16
const PROTECT_RADIUS = 12
const STONE_COOLDOWN_MS = 9000
const ALPHA_NAME = 'AlphaBot'

const CRAFTING_DATA_PATH = path.join(__dirname, 'data', 'craftingRecipes.json')

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'DeltaBot',
  auth: 'offline'
})

bot.loadPlugin(pathfinder)

const state = {
  mode: 'idle', // idle | moving | mining | collecting | fighting | chatting | crafting | auto_follow_alpha | auto_engage | auto_mine | rally
  cancelRequested: false,
  leaderName: null,
  autoLoopRunning: false,
  lastMineAttemptAt: 0,
  lastActiveAt: Date.now(),
  taskToken: 0,
  rallyHold: false,
  craftingData: null
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function setMode(mode) {
  state.mode = mode
  console.log(`[Delta] Mode set to: ${mode}`)
}

function isBusy() {
  return state.mode !== 'idle'
}

function markActive(reason = 'activity') {
  state.lastActiveAt = Date.now()
  console.log(`[Delta] Active: ${reason}`)
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
    console.log('[Delta] Could not clear goal:', err.message)
  }

  try {
    bot.pathfinder.stop()
  } catch (err) {
    console.log('[Delta] Could not stop pathfinder:', err.message)
  }

  try {
    bot.clearControlStates()
  } catch (err) {
    console.log('[Delta] Could not clear control states:', err.message)
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
  console.log(`[Delta] Leader set to: ${playerName}`)
}

function getAlphaEntity() {
  return getPlayerEntity(ALPHA_NAME)
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

    console.log(
      `[Delta] Loaded crafting recipes: ${Object.keys(state.craftingData.items).length} item(s)`
    )
  } catch (err) {
    console.error('[Delta] Failed to load craftingRecipes.json:', err.message)
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
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
}

function resolveRecipeName(name) {
  const craftingData = getCraftingData()
  const normalized = normalizeRecipeKey(name)

  if (!normalized) return null
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

function getItemCountExact(itemName) {
  return bot.inventory
    .items()
    .filter(item => item.name === itemName)
    .reduce((sum, item) => sum + item.count, 0)
}

function getGroupMembers(groupName) {
  const craftingData = getCraftingData()
  return craftingData.groups[groupName] || []
}

function getInventoryCountForRequirement(name) {
  const groupMembers = getGroupMembers(name)

  if (groupMembers.length > 0) {
    return groupMembers.reduce((sum, memberName) => sum + getItemCountExact(memberName), 0)
  }

  return getItemCountExact(name)
}

function hasEnoughRequirement(name, requiredCount) {
  return getInventoryCountForRequirement(name) >= requiredCount
}

function getMissingAmount(name, requiredCount) {
  return Math.max(0, requiredCount - getInventoryCountForRequirement(name))
}

function getInventorySummary() {
  const items = bot.inventory.items()

  if (!items || items.length === 0) {
    return 'Delta inventory is empty.'
  }

  const summary = items
    .slice(0, 8)
    .map(item => `${item.name} x${item.count}`)
    .join(', ')

  if (items.length > 8) {
    return `Delta has: ${summary}, and more.`
  }

  return `Delta has: ${summary}.`
}

function getCraftSummary(recipeName) {
  const recipe = getRecipe(recipeName)
  if (!recipe) return null

  const ingredients = (recipe.ingredients || [])
    .map(part => `${part.item} x${part.count}`)
    .join(', ')

  return `${recipeName}: ${ingredients || 'no ingredients listed'}`
}

function findNearbyCraftingTable(maxDistance = 8) {
  return bot.findBlock({
    matching: block => block && block.name === 'crafting_table',
    maxDistance
  })
}

function getItemByName(itemName) {
  return bot.inventory.items().find(item => item.name === itemName) || null
}

async function moveNearBlock(block, distance = 2) {
  const goal = new goals.GoalNear(
    Math.floor(block.position.x),
    Math.floor(block.position.y),
    Math.floor(block.position.z),
    distance
  )

  await bot.pathfinder.goto(goal)
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

async function ensureCraftingTableAccess(shouldCancel = () => false, announce = true) {
  if (shouldCancel()) {
    throw new Error('Craft canceled')
  }

  let tableBlock = findNearbyCraftingTable(8)
  if (tableBlock) {
    await moveNearBlock(tableBlock, 2)
    return tableBlock
  }

  if (getItemCountExact('crafting_table') <= 0) {
    const craftResult = await craftRecipeByName('crafting_table', {
      shouldCancel,
      announce,
      depth: 0
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
      count: getItemCountExact(memberName)
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

function listMissingLeafRequirements(recipeName, multiplier = 1, missing = []) {
  const recipe = getRecipe(recipeName)
  if (!recipe) return missing

  for (const ingredient of recipe.ingredients || []) {
    const totalRequired = ingredient.count * multiplier
    const onHand = getInventoryCountForRequirement(ingredient.item)

    if (onHand >= totalRequired) {
      continue
    }

    const childRecipeName = resolveRecipeName(ingredient.item)
    if (!childRecipeName) {
      missing.push({
        item: ingredient.item,
        missing: totalRequired - onHand
      })
      continue
    }

    const childRecipe = getRecipe(childRecipeName)
    const outputCount = childRecipe?.outputCount || 1
    const neededCrafts = Math.ceil((totalRequired - onHand) / outputCount)

    listMissingLeafRequirements(childRecipeName, neededCrafts, missing)
  }

  return missing
}

function consolidateMissingItems(missingItems) {
  const map = new Map()

  for (const entry of missingItems) {
    const current = map.get(entry.item) || 0
    map.set(entry.item, current + entry.missing)
  }

  return Array.from(map.entries()).map(([item, missing]) => ({ item, missing }))
}

async function craftRecipeByName(recipeName, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false)
  const announce = options.announce !== false
  const depth = options.depth || 0

  if (depth > 10) {
    return {
      success: false,
      reason: 'craft_dependency_depth_exceeded'
    }
  }

  if (shouldCancel()) {
    return {
      success: false,
      reason: 'canceled'
    }
  }

  const resolvedRecipeName = resolveRecipeName(recipeName)
  if (!resolvedRecipeName) {
    return {
      success: false,
      reason: `unknown_recipe:${recipeName}`
    }
  }

  const recipe = getRecipe(resolvedRecipeName)
  if (!recipe) {
    return {
      success: false,
      reason: `missing_recipe_data:${resolvedRecipeName}`
    }
  }

  if (getItemCountExact(resolvedRecipeName) >= 1) {
    return {
      success: true,
      reason: 'already_have_item',
      craftedItem: resolvedRecipeName
    }
  }

  for (const ingredient of recipe.ingredients || []) {
    const need = ingredient.count
    const have = getInventoryCountForRequirement(ingredient.item)

    if (have >= need) {
      continue
    }

    const dependencyRecipeName = resolveRecipeName(ingredient.item)

    if (!dependencyRecipeName) {
      return {
        success: false,
        reason: `missing_material:${ingredient.item}`,
        craftedItem: null
      }
    }

    const dependencyRecipe = getRecipe(dependencyRecipeName)
    if (!dependencyRecipe) {
      return {
        success: false,
        reason: `missing_recipe_data:${dependencyRecipeName}`,
        craftedItem: null
      }
    }

    const dependencyOutputCount = dependencyRecipe.outputCount || 1
    const shortage = need - have
    const dependencyCraftCount = Math.ceil(shortage / dependencyOutputCount)

    for (let i = 0; i < dependencyCraftCount; i += 1) {
      const dependencyResult = await craftRecipeByName(dependencyRecipeName, {
        shouldCancel,
        announce,
        depth: depth + 1
      })

      if (!dependencyResult.success) {
        return dependencyResult
      }
    }
  }

  if (shouldCancel()) {
    return {
      success: false,
      reason: 'canceled',
      craftedItem: null
    }
  }

  const craftingTableBlock = recipe.requiresTable
    ? await ensureCraftingTableAccess(shouldCancel, announce)
    : null

  const concreteIngredientItems = []
  for (const ingredient of recipe.ingredients || []) {
    concreteIngredientItems.push({
      item: getPreferredConcreteItemForRequirement(ingredient.item),
      count: ingredient.count
    })
  }

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
      craftedItem: null,
      concreteIngredientItems
    }
  }

  if (getItemCountExact(resolvedRecipeName) <= 0) {
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
    console.log('[Delta] Could not equip crafted item:', err.message)
  }

  return {
    success: true,
    reason: 'completed',
    craftedItem: resolvedRecipeName
  }
}

async function tryCraftByUserRequest(requestedName, shouldCancel, announce = true) {
  const resolvedRecipeName = resolveRecipeName(requestedName)

  if (!resolvedRecipeName) {
    const knownItems = Object.keys(getCraftingData().items)
      .slice(0, 12)
      .join(', ')

    return {
      success: false,
      reason: `unknown_recipe:${requestedName}`,
      message: `I do not know that recipe yet. Known recipes include: ${knownItems}.`
    }
  }

  const missingLeafItems = consolidateMissingItems(
    listMissingLeafRequirements(resolvedRecipeName, 1, [])
  ).filter(x => x.missing > 0)

  if (missingLeafItems.length > 0) {
    const missingText = missingLeafItems
      .map(x => `${x.item} x${x.missing}`)
      .join(', ')

    return {
      success: false,
      reason: 'missing_leaf_materials',
      message: `I can read the recipe for ${resolvedRecipeName}, but I am missing: ${missingText}.`
    }
  }

  const result = await craftRecipeByName(resolvedRecipeName, {
    shouldCancel,
    announce,
    depth: 0
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
            'You are Delta, an aggressive Minecraft combat escort for Alpha the miner. Keep replies short, direct, and professional.'
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
      bot.chat(`Delta can't find ${playerName}.`)
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
    bot.chat(`Delta moving to ${playerName}.`)
  }

  await bot.pathfinder.goto(goal)

  if (shouldCancel()) {
    return false
  }

  if (announce) {
    bot.chat('Delta is here.')
  }

  return true
}

function showHelp() {
  bot.chat(
    'Delta commands: help, follow me, come here, rally, mine stone, collect items, fight, first tool, inventory, recipe <item>, craft <item>'
  )
}

function getThreatNearAlpha() {
  const alpha = getAlphaEntity()
  if (!alpha) {
    return getNearestHostile(bot, ENGAGE_RADIUS)
  }

  const hostiles = Object.values(bot.entities)
    .filter(entity => {
      if (!entity) return false
      if (!entity.position) return false
      if (!entity.name) return false
      if (!['zombie', 'skeleton'].includes(entity.name)) return false
      return alpha.position.distanceTo(entity.position) <= PROTECT_RADIUS
    })
    .sort((a, b) => alpha.position.distanceTo(a.position) - alpha.position.distanceTo(b.position))

  return hostiles[0] || null
}

async function runAutonomyTick() {
  if (state.autoLoopRunning) return
  if (isBusy()) return
  if (state.rallyHold) return

  state.autoLoopRunning = true

  try {
    const alpha = getAlphaEntity()

    const threat = getThreatNearAlpha()
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

    if (alpha) {
      const distToAlpha = bot.entity.position.distanceTo(alpha.position)
      if (distToAlpha > FOLLOW_DISTANCE + 1.5) {
        const taskToken = nextTaskToken()
        clearCancelRequest()
        setMode('auto_follow_alpha')
        markActive('auto_follow_alpha_started')

        try {
          await moveNearPlayer(ALPHA_NAME, {
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

    if (getIdleMs() < IDLE_WORK_DELAY_MS) {
      return
    }

    const now = Date.now()
    if (now - state.lastMineAttemptAt < STONE_COOLDOWN_MS) {
      return
    }

    state.lastMineAttemptAt = now

    const taskToken = nextTaskToken()
    clearCancelRequest()
    setMode('auto_mine')
    markActive('auto_mine_started')

    try {
      await mineStone(bot, {
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
    console.error('[Delta] Autonomy tick error:', err)
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
    bot.chat('Delta standing by.')
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
    bot.chat(`Delta will stay with you, ${username}.`)
    return
  }

  if (normalized === 'rally') {
    state.rallyHold = true
    await runCommandTask('rally', 'rally_command', async ({ shouldCancel }) => {
      try {
        await moveNearPlayer(username, {
          shouldCancel,
          announce: true,
          distance: 2
        })
        bot.chat('Delta rally complete. Holding position.')
      } catch (err) {
        console.error('[Delta] Rally error:', err)
        bot.chat('Delta had trouble rallying.')
      }
    })
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
        console.error('[Delta] Movement error:', err)
        bot.chat('Delta had trouble reaching you.')
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
        console.error('[Delta] Fight error:', err)
        bot.chat('Delta had trouble fighting the hostile mob.')
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
        console.error('[Delta] Collect items error:', err)
        bot.chat('Delta had trouble collecting items.')
      }
    })
    return
  }

  if (
    normalized === 'first tool' ||
    normalized === 'bootstrap' ||
    normalized === 'make first tool'
  ) {
    await runCommandTask('crafting', 'bootstrap_first_tool_command', async ({ shouldCancel }) => {
      try {
        const result = await bootstrapFirstTool(bot, {
          shouldCancel,
          announce: true,
          preferredTool: 'wooden_axe'
        })

        console.log('[Delta] bootstrapFirstTool result:', result)

        if (!result.success && !result.canceled) {
          bot.chat(`Delta could not finish first tool. Reason: ${result.reason}.`)
        }
      } catch (err) {
        console.error('[Delta] bootstrapFirstTool error:', err)
        bot.chat(`Delta had trouble making first tool: ${err.message}`)
      }
    })
    return
  }

  if (normalized === 'mine stone' || normalized === 'mine rock') {
    await runCommandTask('mining', 'mine_stone_command', async ({ shouldCancel }) => {
      try {
        state.lastMineAttemptAt = Date.now()

        await mineStone(bot, {
          shouldCancel,
          autoHarvest: true,
          announce: true,
          maxBlocks: 6,
          maxDistance: 20
        })
      } catch (err) {
        console.error('[Delta] Mine stone error:', err)
        bot.chat('Delta had trouble mining stone.')
      }
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
      bot.chat('Say something like: Delta craft wooden axe')
      return
    }

    await runCommandTask('crafting', 'craft_command', async ({ shouldCancel }) => {
      try {
        const result = await tryCraftByUserRequest(requestedItem, shouldCancel, true)
        bot.chat(result.message)
      } catch (err) {
        console.error('[Delta] Craft command error:', err)
        bot.chat(`Delta had trouble crafting ${requestedItem}: ${err.message}`)
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
          bot.chat('Delta chat canceled.')
          break
        }

        bot.chat(line)
        await sleep(150)
      }
    } catch (err) {
      console.error('[Delta] Ollama error:', err)
      bot.chat('Delta could not reach Ollama.')
    }
  })
}

bot.on('spawn', () => {
  console.log('DeltaBot joined the world!')

  loadCraftingData()

  const defaultMoves = new Movements(bot)
  bot.pathfinder.setMovements(defaultMoves)

  bot.chat('Delta online. Combat, mining, and recipe crafting mode active.')

  markActive('spawn')

  setInterval(() => {
    runAutonomyTick().catch(err => console.error('[Delta] Autonomy loop failure:', err))
  }, AUTO_TICK_MS)
})

bot.on('chat', async (username, message) => {
  console.log(`[Delta] ${username}: ${message}`)

  if (username === bot.username) return

  const lower = message.toLowerCase()

  if (!lower.startsWith('delta ')) return

  const prompt = message.slice(6).trim()

  if (!prompt) {
    bot.chat('Say something like: Delta help')
    return
  }

  markActive('incoming_command')
  await handleCommand(username, prompt)
})

bot.on('path_update', results => {
  console.log(`[Delta] Path update: ${results.status}`)
})

bot.on('goal_reached', () => {
  console.log('[Delta] Goal reached.')
  markActive('goal_reached')
})

bot.on('entityHurt', entity => {
  if (entity && entity.id === bot.entity.id) {
    markActive('bot_hurt')
  }
})

bot.on('error', err => console.log('[Delta] Bot error:', err))
bot.on('end', () => console.log('[Delta] Bot disconnected'))
bot.on('kicked', reason => console.log('[Delta] Bot kicked:', reason))
```


## package.json

```json
{
  "name": "minecraft-bot",
  "version": "1.0.0",
  "main": "alphaBot.js",
  "scripts": {
    "start": "node alphaBot.js",
    "start:lumberjack": "node alphaBot.js",
    "start:gp": "node bot.js",
    "start:alpha": "node alphaBot.js",
    "start:bravo": "node bravoBot.js",
    "start:charlie": "node charlieBot.js",
    "start:delta": "node deltaBot.js",
    "start:all": "start cmd /k node bot.js && start cmd /k node bravoBot.js && start cmd /k node charlieBot.js && start cmd /k node alphaBot.js && start cmd /k node deltaBot.js",
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

