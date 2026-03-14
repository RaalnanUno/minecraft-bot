const { createWorkerBot } = require('./bots/createWorkerBot')

createWorkerBot({
  username: 'AlphaBot',
  commandName: 'Alpha',
  personalityPrompt:
    'You are Alpha, a Minecraft worker bot. Keep replies short, direct, and professional.',
  protectTargetName: null
})
