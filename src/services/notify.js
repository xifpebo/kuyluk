'use strict';

/**
 * Optional Telegram notification for new quote requests.
 * Enabled only when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.
 */
const i18n = require('../i18n');
const { logger } = require('../logger');

async function notifyNewQuote(config, quote) {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) return;
  const lang = 'ru';
  const lines = [
    `🧾 ${quote.number}`,
    `${quote.customer.name} · ${quote.customer.phone}`,
    quote.customer.company ? quote.customer.company : null,
    `${i18n.t(lang, `quote.deliveryMethods.${quote.delivery.method}`)}${quote.delivery.region ? ` · ${i18n.t(lang, `regions.${quote.delivery.region}`)}` : ''}`,
    `${i18n.t(lang, 'quote.subtotal')}: ${i18n.formatMoney(lang, quote.estimatedTotal)}`,
    ...quote.items.slice(0, 10).map((item) => `• ${item.name[lang] || item.name.uz} — ${item.qty} ${i18n.t(lang, `units.${item.unit}.short`)}`),
    quote.items.length > 10 ? `… +${quote.items.length - 10}` : null,
    `${config.appOrigin}/admin#/quotes/${quote._id}`
  ].filter(Boolean);
  try {
    const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) logger.warn('Telegram notification failed', { status: response.status });
  } catch (error) {
    logger.warn('Telegram notification error', { message: error.message });
  }
}

module.exports = { notifyNewQuote };
