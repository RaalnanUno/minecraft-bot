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