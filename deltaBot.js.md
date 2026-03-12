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

