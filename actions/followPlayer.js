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