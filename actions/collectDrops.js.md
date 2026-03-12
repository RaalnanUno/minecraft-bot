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

