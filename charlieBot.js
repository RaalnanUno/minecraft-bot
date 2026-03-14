// charlie first tool
// charlie craft axe
// charlie craft pickaxe
// charlie craft sword
// charlie craft shovel
// charlie craft hoe
// charlie craft wooden_axe
// charlie craft wooden_pickaxe
// charlie craft first
// charlie craft second
// charlie craft third
// charlie craft 1
// charlie craft 2
// charlie craft 3

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const { cutTree } = require('./actions/cutTree')
const { collectNearbyDrops } = require('./actions/collectDrops')
const { bootstrapFirstTool } = require('./actions/bootstrapFirstTool')
const {
  fightNearestHostile,
  getNearestHostile,
  getNearestHostileNearPlayer,
  attackEntity
} = require('./actions/fightHostiles')
const { teleportOrMoveToPlayer } = require('./utils/teleportOrMoveToPlayer')

const OLLAMA_URL = 'http://localhost:11434/api/chat'
const OLLAMA_MODEL = 'llama3.2'

const AUTO_TICK_MS = 1500
const IDLE_WORK_DELAY_MS = 10_000
const FOLLOW_DISTANCE = 4
const COME_BACK_DISTANCE = 10
const DEFEND_RADIUS = 12
const TREE_COOLDOWN_MS = 10_000
const HURT_DEFEND_WINDOW_MS = 10_000
const BRAVO_NAME = 'BravoBot'
const BRAVO_PROTECT_DISTANCE = 3

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'CharlieBot',
  auth: 'offline'
})

bot.loadPlugin(pathfinder)

const state = {
  mode: 'idle', // idle | moving | harvesting | collecting | fighting | crafting | chatting | auto_follow | auto_gather | auto_support | auto_defend | reporting
  cancelRequested: false,
  leaderName: null,
  autoLoopRunning: false,
  lastTreeAttemptAt: 0,
  lastActiveAt: Date.now(),
  lastHurtAt: 0,
  taskToken: 0,
  followEnabled: true
}

const TOOL_ALIASES = {
  axe: 'wooden_axe',
  hatchet: 'wooden_axe',
  pickaxe: 'wooden_pickaxe',
  pick: 'wooden_pickaxe',
  sword: 'wooden_sword',
  shovel: 'wooden_shovel',
  spade: 'wooden_shovel',
  hoe: 'wooden_hoe',

  wooden_axe: 'wooden_axe',
  wooden_pickaxe: 'wooden_pickaxe',
  wooden_sword: 'wooden_sword',
  wooden_shovel: 'wooden_shovel',
  wooden_hoe: 'wooden_hoe'
}

const TOOL_ORDER = [
  'wooden_axe',
  'wooden_pickaxe',
  'wooden_sword',
  'wooden_shovel',
  'wooden_hoe'
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function setMode(mode) {
  state.mode = mode
  console.log(`[Charlie] Mode set to: ${mode}`)
}

function isBusy() {
  return state.mode !== 'idle'
}

function markActive(reason = 'activity') {
  state.lastActiveAt = Date.now()
  console.log(`[Charlie] Active: ${reason}`)
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
    console.log('[Charlie] Could not clear goal:', err.message)
  }

  try {
    bot.pathfinder.stop()
  } catch (err) {
    console.log('[Charlie] Could not stop pathfinder:', err.message)
  }

  try {
    bot.clearControlStates()
  } catch (err) {
    console.log('[Charlie] Could not clear control states:', err.message)
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
    .filter(
      player =>
        player &&
        player.username &&
        player.username !== bot.username &&
        player.entity
    )
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
  console.log(`[Charlie] Leader set to: ${playerName}`)
}

function getBravoEntity() {
  return getPlayerEntity(BRAVO_NAME)
}

function getInventorySummary() {
  const items = bot.inventory.items()

  if (!items || items.length === 0) {
    return 'Charlie inventory is empty.'
  }

  const summary = items
    .slice(0, 8)
    .map(item => `${item.name} x${item.count}`)
    .join(', ')

  if (items.length > 8) {
    return `Charlie has: ${summary}, and more.`
  }

  return `Charlie has: ${summary}.`
}

function getStatusSummary() {
  return `Status: mode=${state.mode}, leader=${state.leaderName || 'none'}, follow=${state.followEnabled}, idleMs=${getIdleMs()}`
}

function showHelp() {
  bot.chat(
    'Charlie commands: help, status, follow me, stay here, come here, harvest, cut tree, collect items, fight, inventory, first tool, craft axe, craft pickaxe, craft sword, craft shovel, craft hoe, craft first, craft second, craft third, stop'
  )
}

function shouldAutoDefend() {
  return Date.now() - state.lastHurtAt <= HURT_DEFEND_WINDOW_MS
}

function normalizeCraftTarget(rawPrompt) {
  const normalized = rawPrompt.toLowerCase().trim()

  if (!normalized.startsWith('craft ')) {
    return null
  }

  let requested = normalized.slice('craft '.length).trim()

  if (!requested) {
    return null
  }

  requested = requested
    .replace(/^a\s+/, '')
    .replace(/^an\s+/, '')
    .replace(/^the\s+/, '')
    .trim()

  if (requested === 'first') return TOOL_ORDER[0]
  if (requested === 'second') return TOOL_ORDER[1]
  if (requested === 'third') return TOOL_ORDER[2]
  if (requested === 'fourth') return TOOL_ORDER[3]
  if (requested === 'fifth') return TOOL_ORDER[4]

  if (/^\d+$/.test(requested)) {
    const index = Number(requested) - 1
    if (index >= 0 && index < TOOL_ORDER.length) {
      return TOOL_ORDER[index]
    }
  }

  return TOOL_ALIASES[requested] || null
}

function getCraftHelpText() {
  return 'Craft options: axe, pickaxe, sword, shovel, hoe, or craft first/second/third.'
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
            'You are Charlie, a Minecraft gatherer, support fighter, and basic tool crafter. Keep replies short, practical, and friendly.'
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

  const result = await teleportOrMoveToPlayer(
    bot,
    playerName,
    async (targetPlayerName, moveOptions = {}) => {
      const player = bot.players[targetPlayerName]

      if (!player || !player.entity) {
        if (announce) {
          bot.chat(`Charlie can't find ${targetPlayerName}.`)
        }
        return false
      }

      const target = player.entity.position
      const goal = new goals.GoalNear(
        Math.floor(target.x),
        Math.floor(target.y),
        Math.floor(target.z),
        moveOptions.distance || distance
      )

      if (announce) {
        bot.chat(`Charlie moving to ${targetPlayerName}.`)
      }

      await bot.pathfinder.goto(goal)

      if (moveOptions.shouldCancel && moveOptions.shouldCancel()) {
        return false
      }

      if (announce) {
        bot.chat('Charlie is here.')
      }

      return true
    },
    {
      shouldCancel,
      announce,
      fallbackDistance: distance
    }
  )

  return result.success
}

function getNearestDangerForTeam() {
  const bravo = getBravoEntity()
  if (bravo) {
    const hostileNearBravo = getNearestHostileNearPlayer(bot, BRAVO_NAME, DEFEND_RADIUS)
    if (hostileNearBravo) {
      return hostileNearBravo
    }
  }

  const leaderName = getLeaderName()
  if (leaderName) {
    const hostileNearLeader = getNearestHostileNearPlayer(bot, leaderName, DEFEND_RADIUS)
    if (hostileNearLeader) {
      return hostileNearLeader
    }
  }

  return getNearestHostile(bot, DEFEND_RADIUS)
}

async function supportBravoAgainstThreat(taskToken, hostile) {
  const shouldCancel = makeShouldCancel(taskToken)

  const bravo = getBravoEntity()
  if (!bravo) {
    return
  }

  await moveNearPlayer(BRAVO_NAME, {
    shouldCancel,
    announce: false,
    distance: BRAVO_PROTECT_DISTANCE
  })

  if (shouldCancel()) {
    return
  }

  const freshHostile = bot.entities[hostile.id]
  if (!freshHostile) {
    return
  }

  await attackEntity(bot, freshHostile, {
    shouldCancel,
    maxFightTimeMs: 12000,
    announce: false
  })
}

async function runAutonomyTick() {
  if (state.autoLoopRunning) return
  if (isBusy()) return

  state.autoLoopRunning = true

  try {
    const leaderName = getLeaderName()
    const leaderEntity = leaderName ? getPlayerEntity(leaderName) : null
    const bravoEntity = getBravoEntity()

    const nearbyHostile = getNearestDangerForTeam()
    if (
      nearbyHostile &&
      (shouldAutoDefend() ||
        !leaderEntity ||
        bot.entity.position.distanceTo(nearbyHostile.position) <= 6)
    ) {
      const taskToken = nextTaskToken()
      clearCancelRequest()
      setMode('auto_defend')
      markActive('auto_defend_started')

      try {
        if (bravoEntity) {
          await supportBravoAgainstThreat(taskToken, nearbyHostile)
        } else {
          await attackEntity(bot, nearbyHostile, {
            shouldCancel: makeShouldCancel(taskToken),
            maxFightTimeMs: 12000,
            announce: false
          })
        }
      } finally {
        finishTask(taskToken)
      }

      return
    }

    if (leaderEntity && state.followEnabled) {
      const distanceToLeader = bot.entity.position.distanceTo(leaderEntity.position)

      if (distanceToLeader > COME_BACK_DISTANCE) {
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
    setMode('auto_gather')
    markActive('auto_gather_started')

    try {
      await cutTree(bot, {
        shouldCancel: makeShouldCancel(taskToken),
        autoHarvest: true,
        announce: false
      })

      if (!makeShouldCancel(taskToken)()) {
        await collectNearbyDrops(bot, {
          shouldCancel: makeShouldCancel(taskToken),
          silentNoDrops: true,
          announce: false
        })
      }
    } finally {
      finishTask(taskToken)
    }
  } catch (err) {
    console.error('[Charlie] Autonomy tick error:', err)
    setMode('idle')
    clearCancelRequest()
  } finally {
    state.autoLoopRunning = false
  }
}

bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  const msg = message.toLowerCase().trim()
  const botName = bot.username.toLowerCase()

  if (msg === 'all drop') {
    await dropAllInventory(bot)
    return
  }

  if (msg === `${botName} drop`) {
    await dropAllInventory(bot)
    return
  }
})


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

async function handleCraftCommand(prompt) {
  const craftTarget = normalizeCraftTarget(prompt)

  if (!craftTarget) {
    bot.chat(getCraftHelpText())
    return
  }

  await runCommandTask('crafting', 'craft_command', async ({ shouldCancel }) => {
    try {
      const result = await bootstrapFirstTool(bot, {
        shouldCancel,
        announce: true,
        preferredTool: craftTarget
      })

      console.log('[Charlie] bootstrapFirstTool result:', result)

      if (!result.success && !result.canceled) {
        bot.chat(`Charlie could not craft ${craftTarget}. Reason: ${result.reason}`)
      }
    } catch (err) {
      console.error('[Charlie] Craft error:', err)
      bot.chat(`Charlie had trouble crafting ${craftTarget}: ${err.message}`)
    }
  })
}

async function handleCommand(username, prompt) {
  const normalized = prompt.toLowerCase().trim()
  setLeaderName(username)

  if (normalized === 'help' || normalized === 'commands') {
    interruptCurrentTask('help_command')
    showHelp()
    return
  }

  if (normalized === 'status') {
    interruptCurrentTask('status_command')
    bot.chat(getStatusSummary())
    return
  }

  if (normalized === 'stop' || normalized === 'stay' || normalized === 'cancel') {
    interruptCurrentTask('stop_command')
    bot.chat('Charlie standing by.')
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
    state.followEnabled = true
    bot.chat(`Charlie will stay with you, ${username}.`)
    return
  }

  if (normalized === 'stay here') {
    interruptCurrentTask('stay_here_command')
    state.followEnabled = false
    bot.chat('Charlie will hold here until called.')
    return
  }

  if (normalized === 'come here') {
    state.followEnabled = true

    await runCommandTask('moving', 'come_here_command', async ({ shouldCancel }) => {
      try {
        await moveNearPlayer(username, {
          shouldCancel,
          announce: true,
          distance: 1
        })
      } catch (err) {
        console.error('[Charlie] Movement error:', err)
        bot.chat('Charlie had trouble reaching you.')
      }
    })
    return
  }

  if (
    normalized === 'fight' ||
    normalized === 'attack mob' ||
    normalized === 'attack mobs'
  ) {
    await runCommandTask('fighting', 'fight_command', async ({ shouldCancel }) => {
      try {
        await fightNearestHostile(bot, {
          shouldCancel
        })
      } catch (err) {
        console.error('[Charlie] Fight error:', err)
        bot.chat('Charlie had trouble fighting the hostile mob.')
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
        console.error('[Charlie] Collect items error:', err)
        bot.chat('Charlie had trouble collecting items.')
      }
    })
    return
  }

  if (
    normalized === 'first tool' ||
    normalized === 'bootstrap' ||
    normalized === 'make first tool'
  ) {
    await runCommandTask('crafting', 'bootstrap_first_tool_command', async ({ shouldCancel }) => {
      try {
        const result = await bootstrapFirstTool(bot, {
          shouldCancel,
          announce: true,
          preferredTool: 'wooden_axe'
        })

        console.log('[Charlie] bootstrapFirstTool result:', result)

        if (!result.success && !result.canceled) {
          bot.chat(`Charlie could not finish the first tool. Reason: ${result.reason}`)
        }
      } catch (err) {
        console.error('[Charlie] bootstrapFirstTool error:', err)
        bot.chat(`Charlie had trouble making the first tool: ${err.message}`)
      }
    })
    return
  }

  if (normalized.startsWith('craft ')) {
    await handleCraftCommand(normalized)
    return
  }

  if (
    normalized === 'harvest' ||
    normalized === 'harvest nearby' ||
    normalized === 'cut tree' ||
    normalized === 'cut trees' ||
    normalized === 'harvest trees'
  ) {
    await runCommandTask('harvesting', 'harvest_command', async ({ shouldCancel }) => {
      try {
        state.lastTreeAttemptAt = Date.now()

        await cutTree(bot, {
          shouldCancel,
          autoHarvest: true,
          announce: true
        })
      } catch (err) {
        console.error('[Charlie] Harvest error:', err)
        bot.chat(`Charlie had trouble harvesting: ${err.message}`)
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
          bot.chat('Charlie chat canceled.')
          break
        }

        bot.chat(line)
        await sleep(150)
      }
    } catch (err) {
      console.error('[Charlie] Ollama error:', err)
      bot.chat('Charlie could not reach Ollama.')
    }
  })
}

bot.on('spawn', () => {
  console.log('CharlieBot joined the world!')

  const defaultMoves = new Movements(bot)
  bot.pathfinder.setMovements(defaultMoves)

  bot.chat('Charlie online. Gathering, support, defense, and basic crafting active.')

  markActive('spawn')

  setInterval(() => {
    runAutonomyTick().catch(err => console.error('[Charlie] Autonomy loop failure:', err))
  }, AUTO_TICK_MS)
})

bot.on('chat', async (username, message) => {
  console.log(`[Charlie] ${username}: ${message}`)

  if (username === bot.username) return

  const lower = message.toLowerCase()

  if (!lower.startsWith('charlie ')) return

  const prompt = message.slice(8).trim()

  if (!prompt) {
    bot.chat('Say something like: Charlie help')
    return
  }

  markActive('incoming_command')
  await handleCommand(username, prompt)
})

bot.on('path_update', results => {
  console.log(`[Charlie] Path update: ${results.status}`)
})

bot.on('goal_reached', () => {
  console.log('[Charlie] Goal reached.')
  markActive('goal_reached')
})

bot.on('entityHurt', entity => {
  if (entity && entity.id === bot.entity.id) {
    state.lastHurtAt = Date.now()
    markActive('bot_hurt')
  }
})

bot.on('error', err => console.log('[Charlie] Bot error:', err))
bot.on('end', () => console.log('[Charlie] Bot disconnected'))
bot.on('kicked', reason => console.log('[Charlie] Bot kicked:', reason))