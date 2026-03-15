async function equipBestHarvestTool(bot, block) {
  if (!bot || !block) {
    return { success: false, reason: 'missing_bot_or_block' }
  }

  try {
    if (bot.tool && typeof bot.tool.equipForBlock === 'function') {
      await bot.tool.equipForBlock(block, { requireHarvest: false })
      return { success: true, reason: 'mineflayer_tool' }
    }
  } catch (err) {
    console.log(`[${bot.username}] mineflayer-tool equip failed: ${err.message}`)
  }

  try {
    if (bot.pathfinder && typeof bot.pathfinder.bestHarvestTool === 'function') {
      const tool = bot.pathfinder.bestHarvestTool(block)

      if (tool) {
        await bot.equip(tool, 'hand')
        return { success: true, reason: 'pathfinder_fallback' }
      }
    }
  } catch (err) {
    console.log(`[${bot.username}] pathfinder fallback equip failed: ${err.message}`)
  }

  return { success: false, reason: 'no_tool_equipped' }
}

module.exports = {
  equipBestHarvestTool
}