## bot.js

```js
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { cutTree } = require('./actions/cutTree')
const { collectNearbyDrops } = require('./actions/collectDrops')
const {
  fightNearestHostile,
  getNearestHostileNearPlayer,
  attackEntity
} = require('./actions/fightHostiles')

const OLLAMA_URL = 'http://localhost:11434/api/chat'
const OLLAMA_MODEL = 'llama3.2'

const AUTO_TICK_MS = 1500
const IDLE_WORK_DELAY_MS = 60_000
const FOLLOW_DISTANCE = 3
const DEFEND_RADIUS = 10
const TREE_COOLDOWN_MS = 12_000

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'AI_Bot',
  auth: 'offline'
})

bot.loadPlugin(pathfinder)

const state = {
  mode: 'idle', // idle | moving | cutting | collecting | fighting | chatting | auto_follow | auto_cut | auto_defend
  cancelRequested: false,
  leaderName: null,
  autoLoopRunning: false,
  lastTreeAttemptAt: 0,
  lastActiveAt: Date.now(),
  taskToken: 0
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function setMode(mode) {
  state.mode = mode
  console.log(`Mode set to: ${mode}`)
}

function isBusy() {
  return state.mode !== 'idle'
}

function markActive(reason = 'activity') {
  state.lastActiveAt = Date.now()
  console.log(`Active: ${reason}`)
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
    console.log('Could not clear goal:', err.message)
  }

  try {
    bot.pathfinder.stop()
  } catch (err) {
    console.log('Could not stop pathfinder:', err.message)
  }

  try {
    bot.clearControlStates()
  } catch (err) {
    console.log('Could not clear control states:', err.message)
  }
}

function interruptCurrentTask(reason = 'interrupt') {
  state.cancelRequested = true
  nextTaskToken()
  hardStopMotion()
  setMode('idle')
  markActive(reason)
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
  console.log(`Leader set to: ${playerName}`)
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
            'You are a helpful Minecraft companion. Keep replies short, friendly, and under 100 characters when possible.'
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
  return data?.message?.content?.trim() || 'I have no response.'
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
      bot.chat(`I can't find ${playerName}.`)
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
    bot.chat(`Coming to you, ${playerName}.`)
  }

  await bot.pathfinder.goto(goal)

  if (shouldCancel()) {
    return false
  }

  if (announce) {
    bot.chat('I am here.')
  }

  return true
}

function getInventorySummary() {
  const items = bot.inventory.items()

  if (!items || items.length === 0) {
    return 'My inventory is empty.'
  }

  const summary = items
    .slice(0, 8)
    .map(item => `${item.name} x${item.count}`)
    .join(', ')

  if (items.length > 8) {
    return `I have: ${summary}, and more.`
  }

  return `I have: ${summary}.`
}

function showHelp() {
  bot.chat(
    'Commands: help, follow me, come here, cut tree, collect items, fight, stop, inventory'
  )
}

async function runAutonomyTick() {
  if (state.autoLoopRunning) return
  if (isBusy()) return

  const leaderName = getLeaderName()
  if (!leaderName) return

  state.autoLoopRunning = true

  try {
    const leaderEntity = getPlayerEntity(leaderName)
    if (!leaderEntity) return

    const hostile = getNearestHostileNearPlayer(bot, leaderName, DEFEND_RADIUS)
    if (hostile) {
      const taskToken = nextTaskToken()
      clearCancelRequest()
      setMode('auto_defend')
      markActive('auto_defend_started')

      try {
        await attackEntity(bot, hostile, {
          shouldCancel: makeShouldCancel(taskToken),
          maxFightTimeMs: 15000,
          announce: false
        })
      } finally {
        finishTask(taskToken)
      }

      return
    }

    const distanceToLeader = bot.entity.position.distanceTo(leaderEntity.position)
    if (distanceToLeader > FOLLOW_DISTANCE + 1.5) {
      const taskToken = nextTaskToken()
      clearCancelRequest()
      setMode('auto_follow')
      markActive('auto_follow_started')

      try {
        await moveNearPlayer(leaderName, {
          shouldCancel: makeShouldCancel(taskToken),
          announce: false,
          distance: FOLLOW_DISTANCE
        })
      } finally {
        finishTask(taskToken)
      }

      return
    }

    if (getIdleMs() < IDLE_WORK_DELAY_MS) {
      return
    }

    const now = Date.now()
    if (now - state.lastTreeAttemptAt < TREE_COOLDOWN_MS) {
      return
    }

    state.lastTreeAttemptAt = now

    const taskToken = nextTaskToken()
    clearCancelRequest()
    setMode('auto_cut')
    markActive('auto_cut_started')

    try {
      await cutTree(bot, {
        shouldCancel: makeShouldCancel(taskToken),
        autoHarvest: true,
        announce: false
      })
    } finally {
      finishTask(taskToken)
    }
  } catch (err) {
    console.error('Autonomy tick error:', err)
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
    bot.chat('Stopping now.')
    return
  }

  if (normalized === 'inventory' || normalized === 'what do you have') {
    await runCommandTask('collecting', 'inventory_command', async () => {
      bot.chat(getInventorySummary())
    })
    return
  }

  if (normalized === 'follow me') {
    interruptCurrentTask('follow_command')
    bot.chat(`Okay ${username}, I will stay with you.`)
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
        console.error('Movement error:', err)
        bot.chat('I had trouble getting to you.')
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
        console.error('Fight error:', err)
        bot.chat('I had trouble fighting the hostile mob.')
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
        console.error('Collect items error:', err)
        bot.chat('I had trouble collecting items.')
      }
    })
    return
  }

  if (normalized === 'cut tree') {
    await runCommandTask('cutting', 'cut_tree_command', async ({ shouldCancel }) => {
      try {
        state.lastTreeAttemptAt = Date.now()

        await cutTree(bot, {
          shouldCancel,
          autoHarvest: true,
          announce: true
        })
      } catch (err) {
        console.error('Cut tree error:', err)
        bot.chat('I had trouble cutting the tree.')
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
          bot.chat('Chat canceled.')
          break
        }

        bot.chat(line)
        await sleep(150)
      }
    } catch (err) {
      console.error('Ollama error:', err)
      bot.chat('I could not reach Ollama.')
    }
  })
}

bot.on('spawn', () => {
  console.log('Bot joined the world!')

  const defaultMoves = new Movements(bot)
  bot.pathfinder.setMovements(defaultMoves)

  bot.chat('AI_Bot is online. I will stay nearby, defend you, and work after being idle.')

  markActive('spawn')

  setInterval(() => {
    runAutonomyTick().catch(err => console.error('Autonomy loop failure:', err))
  }, AUTO_TICK_MS)
})

bot.on('chat', async (username, message) => {
  console.log(`${username}: ${message}`)

  if (username === bot.username) return
  if (!message.toLowerCase().startsWith('bot ')) return

  const prompt = message.slice(4).trim()

  if (!prompt) {
    bot.chat('Say something like: bot help')
    return
  }

  markActive('incoming_command')
  await handleCommand(username, prompt)
})

bot.on('path_update', results => {
  console.log(`Path update: ${results.status}`)
})

bot.on('goal_reached', () => {
  console.log('Bot reached the goal.')
  markActive('goal_reached')
})

bot.on('entityHurt', entity => {
  if (entity && entity.id === bot.entity.id) {
    markActive('bot_hurt')
  }
})

bot.on('error', err => console.log('Bot error:', err))
bot.on('end', () => console.log('Bot disconnected'))
bot.on('kicked', reason => console.log('Bot kicked:', reason))
```

