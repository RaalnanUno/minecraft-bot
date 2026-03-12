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

