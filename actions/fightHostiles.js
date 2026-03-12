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