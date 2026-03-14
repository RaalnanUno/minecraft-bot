const { createWorkerBot } = require('./bots/createWorkerBot')

createWorkerBot({
  username: 'BravoBot',
  commandName: 'Bravo',
  personalityPrompt:
    'You are Bravo, a Minecraft worker bot. Keep replies short, direct, and professional.',
  protectTargetName: 'AlphaBot'
})
