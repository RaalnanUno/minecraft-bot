## BravoBot.js

```js
// Alpha help
// Alpha craft axe
// Alpha craft planks
// Alpha inventory
// Alpha first tool

// Bravo help
// Bravo craft pickaxe
// Bravo inventory

// all drop

const { createWorkerBot } = require('./bots/createWorkerBot')

createWorkerBot({
  username: 'BravoBot',
  commandName: 'Bravo',
  personalityPrompt:
    'You are Bravo, a Minecraft worker bot. Keep replies short, direct, and professional.',
  protectTargetName: 'AlphaBot'
})

```

