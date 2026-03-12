## alphaBot.js

I want to repurpose this one.
It should mine materials with the intention of making materials to drop for others to collect.

It may need to switch what item it uses for harvesting and defense. For example, I notice that hitting stone with wood seems to take longer than hitting wood with stone.

It should also come to me if I get too far away, and start mining when left idle for more then a minute.


```js
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { mineStone } = require('./actions/mineStone')
const { collectNearbyDrops } = require('./actions/collectDrops')
const {
  fightNearestHostile,
  getNearestHostile,
  attackEntity
} = require('./actions/fightHostiles')

const OLLAMA_URL = 'http://localhost:11434/api/chat'
const OLLAMA_MODEL = 'llama3.2'

const AUTO_TICK_MS = 1500
const IDLE_WORK_DELAY_MS = 10_000
const FOLLOW_DISTANCE = 5
const DANGER_RADIUS = 10
const STONE_COOLDOWN_MS = 10_000
const BRAVO_NAME = 'BravoBot'
const BRAVO_SAFE_DISTANCE = 3

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'AlphaBot',
  auth: 'offline'
})

bot.loadPlugin(pathfinder)

const state = {
  mode: 'idle', // idle | moving | mining | collecting | fighting | chatting | auto_mine | auto_retreat | rally
  cancelRequested: false,
  leaderName: null,
  autoLoopRunning: false,
  lastMineAttemptAt: 0,
  lastActiveAt: Date.now(),
  taskToken: 0,
  rallyHold: false
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function setMode(mode) {
  state.mode = mode
  console.log(`[Alpha] Mode set to: ${mode}`)
}

function isBusy() {
  return state.mode !== 'idle'
}

function markActive(reason = 'activity') {
  state.lastActiveAt = Date.now()
  console.log(`[Alpha] Active: ${reason}`)
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
    console.log('[Alpha] Could not clear goal:', err.message)
  }

  try {
    bot.pathfinder.stop()
  } catch (err) {
    console.log('[Alpha] Could not stop pathfinder:', err.message)
  }

  try {
    bot.clearControlStates()
  } catch (err) {
    console.log('[Alpha] Could not clear control states:', err.message)
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
  console.log(`[Alpha] Leader set to: ${playerName}`)
}

function getBravoEntity() {
  return getPlayerEntity(BRAVO_NAME)
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
            'You are Alpha, a determined Minecraft stone miner. Keep replies short, practical, and confident.'
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
      bot.chat(`Alpha can't find ${playerName}.`)
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
    bot.chat(`Alpha moving to ${playerName}.`)
  }

  await bot.pathfinder.goto(goal)

  if (shouldCancel()) {
    return false
  }

  if (announce) {
    bot.chat('Alpha is here.')
  }

  return true
}

function getInventorySummary() {
  const items = bot.inventory.items()

  if (!items || items.length === 0) {
    return 'Alpha inventory is empty.'
  }

  const summary = items
    .slice(0, 8)
    .map(item => `${item.name} x${item.count}`)
    .join(', ')

  if (items.length > 8) {
    return `Alpha has: ${summary}, and more.`
  }

  return `Alpha has: ${summary}.`
}

function showHelp() {
  bot.chat(
    'Alpha commands: help, follow me, come here, rally, mine stone, collect items, fight, stop, inventory'
  )
}

async function retreatToBravo(taskToken) {
  const bravo = getBravoEntity()
  if (!bravo) {
    return false
  }

  return moveNearPlayer(BRAVO_NAME, {
    shouldCancel: makeShouldCancel(taskToken),
    announce: false,
    distance: BRAVO_SAFE_DISTANCE
  })
}

async function runAutonomyTick() {
  if (state.autoLoopRunning) return
  if (isBusy()) return
  if (state.rallyHold) return

  state.autoLoopRunning = true

  try {
    const nearbyDanger = getNearestHostile(bot, DANGER_RADIUS)

    if (nearbyDanger) {
      const taskToken = nextTaskToken()
      clearCancelRequest()
      setMode('auto_retreat')
      markActive('auto_retreat_started')

      try {
        const reachedBravo = await retreatToBravo(taskToken)

        if (!reachedBravo) {
          const freshDanger = bot.entities[nearbyDanger.id]
          if (freshDanger) {
            await attackEntity(bot, freshDanger, {
              shouldCancel: makeShouldCancel(taskToken),
              maxFightTimeMs: 10000,
              announce: false
            })
          }
        }
      } finally {
        finishTask(taskToken)
      }

      return
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
        maxBlocks: 8,
        maxDistance: 28
      })
    } finally {
      finishTask(taskToken)
    }
  } catch (err) {
    console.error('[Alpha] Autonomy tick error:', err)
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
    bot.chat('Alpha standing by.')
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
    bot.chat(`Alpha will stay with you, ${username}.`)
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
        bot.chat('Alpha rally complete. Holding position.')
      } catch (err) {
        console.error('[Alpha] Rally error:', err)
        bot.chat('Alpha had trouble rallying.')
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
        console.error('[Alpha] Movement error:', err)
        bot.chat('Alpha had trouble reaching you.')
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
        console.error('[Alpha] Fight error:', err)
        bot.chat('Alpha had trouble fighting the hostile mob.')
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
        console.error('[Alpha] Collect items error:', err)
        bot.chat('Alpha had trouble collecting items.')
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
          maxBlocks: 8,
          maxDistance: 28
        })
      } catch (err) {
        console.error('[Alpha] Mine stone error:', err)
        bot.chat('Alpha had trouble mining stone.')
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
          bot.chat('Alpha chat canceled.')
          break
        }

        bot.chat(line)
        await sleep(150)
      }
    } catch (err) {
      console.error('[Alpha] Ollama error:', err)
      bot.chat('Alpha could not reach Ollama.')
    }
  })
}

bot.on('spawn', () => {
  console.log('AlphaBot joined the world!')

  const defaultMoves = new Movements(bot)
  bot.pathfinder.setMovements(defaultMoves)

  bot.chat('Alpha online. Stone mining mode active.')

  markActive('spawn')

  setInterval(() => {
    runAutonomyTick().catch(err => console.error('[Alpha] Autonomy loop failure:', err))
  }, AUTO_TICK_MS)
})

bot.on('chat', async (username, message) => {
  console.log(`[Alpha] ${username}: ${message}`)

  if (username === bot.username) return

  const lower = message.toLowerCase()

  if (!lower.startsWith('alpha ')) return

  const prompt = message.slice(6).trim()

  if (!prompt) {
    bot.chat('Say something like: Alpha help')
    return
  }

  markActive('incoming_command')
  await handleCommand(username, prompt)
})

bot.on('path_update', results => {
  console.log(`[Alpha] Path update: ${results.status}`)
})

bot.on('goal_reached', () => {
  console.log('[Alpha] Goal reached.')
  markActive('goal_reached')
})

bot.on('entityHurt', entity => {
  if (entity && entity.id === bot.entity.id) {
    markActive('bot_hurt')
  }
})

bot.on('error', err => console.log('[Alpha] Bot error:', err))
bot.on('end', () => console.log('[Alpha] Bot disconnected'))
bot.on('kicked', reason => console.log('[Alpha] Bot kicked:', reason))
```