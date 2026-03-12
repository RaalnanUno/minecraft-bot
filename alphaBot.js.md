## alphaBot.js

```js
const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");

const { harvestNearby } = require("./actions/harvestNearby");
const { collectNearbyDrops } = require("./actions/collectDrops");
const { bootstrapFirstTool } = require("./actions/bootstrapFirstTool");

const {
  fightNearestHostile,
  getNearestHostile,
  attackEntity,
} = require("./actions/fightHostiles");
const { teleportOrMoveToPlayer } = require("./utils/teleportOrMoveToPlayer");

const AUTO_TICK_MS = 1500;
const IDLE_WORK_DELAY_MS = 60_000;
const FOLLOW_DISTANCE = 3;
const COME_BACK_DISTANCE = 10;
const DEFEND_RADIUS = 12;
const TREE_COOLDOWN_MS = 12_000;
const HURT_DEFEND_WINDOW_MS = 10_000;

const bot = mineflayer.createBot({
  host: "localhost",
  port: 25565,
  username: "AlphaBot",
  auth: "offline",
});

bot.loadPlugin(pathfinder);

const state = {
  mode: "idle", // idle | moving | harvesting | collecting | fighting | auto_follow | auto_harvest | auto_defend | reporting
  cancelRequested: false,
  leaderName: null,
  autoLoopRunning: false,
  lastTreeAttemptAt: 0,
  lastActiveAt: Date.now(),
  lastHurtAt: 0,
  taskToken: 0,
  followEnabled: true,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setMode(mode) {
  state.mode = mode;
  console.log(`[AlphaBot] Mode set to: ${mode}`);
}

function isBusy() {
  return state.mode !== "idle";
}

function markActive(reason = "activity") {
  state.lastActiveAt = Date.now();
  console.log(`[AlphaBot] Active: ${reason}`);
}

function getIdleMs() {
  return Date.now() - state.lastActiveAt;
}

function nextTaskToken() {
  state.taskToken += 1;
  return state.taskToken;
}

function makeShouldCancel(taskToken) {
  return () => state.cancelRequested || taskToken !== state.taskToken;
}

function clearCancelRequest() {
  state.cancelRequested = false;
}

function hardStopMotion() {
  try {
    bot.pathfinder.setGoal(null);
  } catch (err) {
    console.log("[AlphaBot] Could not clear goal:", err.message);
  }

  try {
    bot.pathfinder.stop();
  } catch (err) {
    console.log("[AlphaBot] Could not stop pathfinder:", err.message);
  }

  try {
    bot.clearControlStates();
  } catch (err) {
    console.log("[AlphaBot] Could not clear control states:", err.message);
  }
}

function interruptCurrentTask(reason = "interrupt") {
  state.cancelRequested = true;
  nextTaskToken();
  hardStopMotion();
  setMode("idle");
  markActive(reason);
}

function finishTask(taskToken) {
  if (taskToken !== state.taskToken) {
    return;
  }

  clearCancelRequest();
  setMode("idle");
  markActive("task_finished");
}

function getPlayerEntity(playerName) {
  if (!playerName) return null;
  const player = bot.players[playerName];
  if (!player) return null;
  return player.entity || null;
}

function getNearestPlayerName() {
  const players = Object.values(bot.players)
    .filter(
      (player) =>
        player &&
        player.username &&
        player.username !== bot.username &&
        player.entity,
    )
    .sort((a, b) => {
      const distA = bot.entity.position.distanceTo(a.entity.position);
      const distB = bot.entity.position.distanceTo(b.entity.position);
      return distA - distB;
    });

  return players[0]?.username || null;
}

function getLeaderName() {
  if (state.leaderName && getPlayerEntity(state.leaderName)) {
    return state.leaderName;
  }

  const nearest = getNearestPlayerName();
  if (nearest) {
    state.leaderName = nearest;
    return nearest;
  }

  return null;
}

function setLeaderName(playerName) {
  state.leaderName = playerName;
  console.log(`[AlphaBot] Leader set to: ${playerName}`);
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
          bot.chat(`I can't find ${targetPlayerName}.`)
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
        bot.chat(`Coming to you, ${targetPlayerName}.`)
      }

      await bot.pathfinder.goto(goal)

      if (moveOptions.shouldCancel && moveOptions.shouldCancel()) {
        return false
      }

      if (announce) {
        bot.chat('I am here.')
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

function getInventorySummary() {
  const items = bot.inventory.items();

  if (!items || items.length === 0) {
    return "My inventory is empty.";
  }

  const summary = items
    .slice(0, 8)
    .map((item) => `${item.name} x${item.count}`)
    .join(", ");

  if (items.length > 8) {
    return `I have: ${summary}, and more.`;
  }

  return `I have: ${summary}.`;
}

function getStatusSummary() {
  return `Status: mode=${state.mode}, leader=${state.leaderName || "none"}, follow=${state.followEnabled}, idleMs=${getIdleMs()}`;
}

function showHelp() {
  bot.chat(
    "Commands: help, status, follow me, stay here, come here, harvest, first tool, collect items, fight, stop, inventory",
  );
}

function shouldAutoDefend() {
  return Date.now() - state.lastHurtAt <= HURT_DEFEND_WINDOW_MS;
}

async function runAutonomyTick() {
  if (state.autoLoopRunning) return;
  if (isBusy()) return;

  state.autoLoopRunning = true;

  try {
    const leaderName = getLeaderName();
    const leaderEntity = leaderName ? getPlayerEntity(leaderName) : null;

    const nearbyHostile = getNearestHostile(bot, DEFEND_RADIUS);
    if (
      nearbyHostile &&
      (shouldAutoDefend() ||
        !leaderEntity ||
        bot.entity.position.distanceTo(nearbyHostile.position) <= 6)
    ) {
      const taskToken = nextTaskToken();
      clearCancelRequest();
      setMode("auto_defend");
      markActive("auto_defend_started");

      try {
        await attackEntity(bot, nearbyHostile, {
          shouldCancel: makeShouldCancel(taskToken),
          maxFightTimeMs: 15000,
          announce: false,
        });
      } finally {
        finishTask(taskToken);
      }

      return;
    }

    if (leaderEntity && state.followEnabled) {
      const distanceToLeader = bot.entity.position.distanceTo(
        leaderEntity.position,
      );

      if (distanceToLeader > COME_BACK_DISTANCE) {
        const taskToken = nextTaskToken();
        clearCancelRequest();
        setMode("auto_follow");
        markActive("auto_follow_started");

        try {
          await moveNearPlayer(leaderName, {
            shouldCancel: makeShouldCancel(taskToken),
            announce: false,
            distance: FOLLOW_DISTANCE,
          });
        } finally {
          finishTask(taskToken);
        }

        return;
      }
    }

    if (getIdleMs() < IDLE_WORK_DELAY_MS) {
      return;
    }

const now = Date.now();
if (now - state.lastTreeAttemptAt < TREE_COOLDOWN_MS) {
  return;
}

state.lastTreeAttemptAt = now;

const taskToken = nextTaskToken();
clearCancelRequest();
setMode("auto_harvest");
markActive("auto_harvest_started");

try {
  await harvestNearby(bot, {
    shouldCancel: makeShouldCancel(taskToken),
    autoCollect: true,
    announce: false,
    maxBlocks: 10,
    scanDistance: 6
  });
} finally {
  finishTask(taskToken);
}
  } catch (err) {
    console.error("[AlphaBot] Autonomy tick error:", err);
    setMode("idle");
    clearCancelRequest();
  } finally {
    state.autoLoopRunning = false;
  }
}

async function runCommandTask(mode, reason, runner) {
  interruptCurrentTask(reason);
  await sleep(100);

  const taskToken = nextTaskToken();
  clearCancelRequest();
  setMode(mode);
  markActive(`${mode}_started`);

  try {
    await runner({
      taskToken,
      shouldCancel: makeShouldCancel(taskToken),
    });
  } finally {
    finishTask(taskToken);
  }
}

async function handleCommand(username, prompt) {
  const normalized = prompt.toLowerCase().trim();
  setLeaderName(username);

  if (normalized === "help" || normalized === "commands") {
    interruptCurrentTask("help_command");
    showHelp();
    return;
  }

  if (normalized === "status") {
    interruptCurrentTask("status_command");
    bot.chat(getStatusSummary());
    return;
  }

  if (normalized === "stop" || normalized === "cancel") {
    interruptCurrentTask("stop_command");
    bot.chat("Stopping now.");
    return;
  }

  if (normalized === "inventory" || normalized === "what do you have") {
    await runCommandTask("reporting", "inventory_command", async () => {
      bot.chat(getInventorySummary());
    });
    return;
  }

  if (normalized === "follow me") {
    interruptCurrentTask("follow_command");
    state.followEnabled = true;
    bot.chat(`Okay ${username}, I will stay with you.`);
    return;
  }

  if (normalized === "stay here") {
    interruptCurrentTask("stay_here_command");
    state.followEnabled = false;
    bot.chat("Okay. I will hold here until you call me.");
    return;
  }

  if (normalized === "come here") {
    state.followEnabled = true;

    await runCommandTask(
      "moving",
      "come_here_command",
      async ({ shouldCancel }) => {
        try {
          await moveNearPlayer(username, {
            shouldCancel,
            announce: true,
            distance: 1,
          });
        } catch (err) {
          console.error("[AlphaBot] Movement error:", err);
          bot.chat("I had trouble getting to you.");
        }
      },
    );
    return;
  }

  if (
    normalized === "fight" ||
    normalized === "attack mob" ||
    normalized === "attack mobs"
  ) {
    await runCommandTask(
      "fighting",
      "fight_command",
      async ({ shouldCancel }) => {
        try {
          await fightNearestHostile(bot, {
            shouldCancel,
          });
        } catch (err) {
          console.error("[AlphaBot] Fight error:", err);
          bot.chat("I had trouble fighting the hostile mob.");
        }
      },
    );
    return;
  }

  if (normalized === "collect items" || normalized === "pick up items") {
    await runCommandTask(
      "collecting",
      "collect_command",
      async ({ shouldCancel }) => {
        try {
          await collectNearbyDrops(bot, {
            shouldCancel,
          });
        } catch (err) {
          console.error("[AlphaBot] Collect items error:", err);
          bot.chat("I had trouble collecting items.");
        }
      },
    );
    return;
  }

  if (
    normalized === "first tool" ||
    normalized === "bootstrap" ||
    normalized === "make first tool"
  ) {
    await runCommandTask(
      "harvesting",
      "bootstrap_first_tool_command",
      async ({ shouldCancel }) => {
        try {
          const result = await bootstrapFirstTool(bot, {
            shouldCancel,
            announce: true,
            preferredTool: "wooden_axe"
          });

          console.log("[AlphaBot] bootstrapFirstTool result:", result);

          if (!result.success && !result.canceled) {
            bot.chat(`I could not finish making my first tool. Reason: ${result.reason}`);
          }
        } catch (err) {
          console.error("[AlphaBot] bootstrapFirstTool error:", err);
          bot.chat(`I had trouble bootstrapping my first tool: ${err.message}`);
        }
      }
    );
    return;
  }

  if (
    normalized === "harvest" ||
    normalized === "harvest nearby" ||
    normalized === "cut tree" ||
    normalized === "cut trees" ||
    normalized === "harvest trees"
  ) {
    await runCommandTask(
      "harvesting",
      "harvest_command",
      async ({ shouldCancel }) => {
        try {
          state.lastTreeAttemptAt = Date.now();

          const result = await harvestNearby(bot, {
            shouldCancel,
            autoCollect: true,
            announce: true,
            maxBlocks: 12,
            scanDistance: 6
          });

          console.log("[AlphaBot] harvestNearby result:", result);
        } catch (err) {
          console.error("[AlphaBot] Harvest error:", err);
          bot.chat(`I had trouble harvesting nearby blocks: ${err.message}`);
        }
      }
    );
    return;
  }

  bot.chat('Unknown command. Say "AlphaBot help".');
}

bot.on("spawn", () => {
  console.log("AlphaBot joined the world!");

  const defaultMoves = new Movements(bot);
  bot.pathfinder.setMovements(defaultMoves);

bot.chat(
  "AlphaBot online. I will harvest nearby blocks, collect drops, defend myself, and regroup with you."
)

  markActive("spawn");

  setInterval(() => {
    runAutonomyTick().catch((err) =>
      console.error("[AlphaBot] Autonomy loop failure:", err),
    );
  }, AUTO_TICK_MS);
});

bot.on("chat", async (username, message) => {
  console.log(`[AlphaBot] ${username}: ${message}`);

  if (username === bot.username) return;

  const lower = message.toLowerCase();

  if (!lower.startsWith("lumberjack ")) return;

  const prompt = message.slice("lumberjack ".length).trim();

  if (!prompt) {
    bot.chat("Say something like: AlphaBot help");
    return;
  }

  markActive("incoming_command");
  await handleCommand(username, prompt);
});

bot.on("path_update", (results) => {
  console.log(`[AlphaBot] Path update: ${results.status}`);
});

bot.on("goal_reached", () => {
  console.log("[AlphaBot] Goal reached.");
  markActive("goal_reached");
});

bot.on("entityHurt", (entity) => {
  if (entity && bot.entity && entity.id === bot.entity.id) {
    state.lastHurtAt = Date.now();
    markActive("bot_hurt");
  }
});

bot.on("error", (err) => console.log("[AlphaBot] Bot error:", err));
bot.on("end", () => console.log("[AlphaBot] Bot disconnected"));
bot.on("kicked", (reason) => console.log("[AlphaBot] Bot kicked:", reason));

```

