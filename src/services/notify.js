'use strict';

/**
 * Optional Telegram notifications for moderators (new shop applications and
 * products waiting for review). Enabled only when TELEGRAM_BOT_TOKEN and
 * TELEGRAM_CHAT_ID are set; failures never affect the request.
 */
const { logger } = require('../logger');

async function send(config, lines) {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: lines.filter(Boolean).join('\n'), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) logger.warn('Telegram notification failed', { status: response.status });
  } catch (error) {
    logger.warn('Telegram notification error', { message: error.message });
  }
}

function notifyShopApplication(config, shop) {
  return send(config, ['🏪 Новая заявка магазина', shop.name, shop.phone, `${config.appOrigin}/admin#/approvals`]);
}

function notifyProductSubmitted(config, product, shop) {
  return send(config, ['📦 Товар на модерации', `${product.sku} · ${product.name?.ru || product.name?.uz}`, shop?.name, `${config.appOrigin}/admin#/approvals`]);
}

module.exports = { notifyShopApplication, notifyProductSubmitted };
