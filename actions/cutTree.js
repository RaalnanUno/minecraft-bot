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