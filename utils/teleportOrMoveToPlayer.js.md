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

