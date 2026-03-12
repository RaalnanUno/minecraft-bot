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

