const { equipBestHarvestTool } = require('../utils/equipBestTool')
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