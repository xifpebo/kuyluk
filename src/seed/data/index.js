'use strict';

const { categories, brands, L } = require('./taxonomy');
const { shops, pendingShop } = require('./shops');
const { spec, made, P } = require('./helpers');

const products = [...require('./products-bath'), ...require('./products-finish'), ...require('./products-eng')];

/**
 * Submissions that demonstrate the moderation workflow (owner adds a product
 * → pending review → admin approves or rejects). They reuse photos of
 * related approved products.
 */
const pendingProducts = [
  {
    ...P('WC-ST-QUADRO-P', 'unitaz-markazi', 'toilets', 'santeko',
      L('Santeko Quadro Plus kompakt unitaz, mikrolift qopqoq', 'Унитаз-компакт Santeko Quadro Plus, крышка микролифт'),
      L('Quadro seriyasining yangilangan modeli: gardishsiz chashka va mikrolift qopqoq.', 'Обновлённая модель серии Quadro: безободковая чаша и крышка с микролифтом.'),
      2050000, { colors: ['white'], sizes: ['670×350×800 mm'], specs: [spec.size('670×350×800 mm'), made('UZ')] }),
    images: ['/img/products/wc-st-quadro.webp'],
    status: 'pending'
  },
  {
    ...P('PNT-CP-INT5', 'colormix-boyoqlar', 'wall-paint', 'colorpro',
      L('ColorPro Interior yuviladigan boʻyoq, 5 l, oq', 'Краска ColorPro Interior моющаяся, 5 л, белая'),
      L('Mashhur Interior boʻyogʻining 5 litrlik qadoqi — kichik xonalar uchun.', 'Популярная краска Interior в упаковке 5 литров — для небольших комнат.'),
      215000, { colors: ['white'], sizes: ['5 l'], specs: [spec.volume(5), made('UZ')] }),
    images: ['/img/products/pnt-cp-int10.webp'],
    status: 'pending'
  },
  {
    ...P('TIL-KO-CONC3060', 'keramika-plaza', 'porcelain-tiles', 'kerama-orient',
      L('Kerama Orient Beton keramogranit 30×60, kulrang', 'Керамогранит Kerama Orient Beton 30×60, серый'),
      L('Beton teksturali keramogranit 30×60 formatda — devor va pol uchun.', 'Керамогранит с текстурой бетона в формате 30×60 для стен и пола.'),
      112000, { unit: 'm2', colors: ['gray'], sizes: ['300×600 mm'], specs: [spec.size('300×600 mm'), made('UZ')] }),
    images: ['/img/products/til-ko-conc60.webp'],
    status: 'pending'
  },
  {
    ...P('DR-PN-TEST', 'portanova-eshiklar', 'interior-doors', 'porta-nova',
      L('Eshik', 'Дверь'),
      L('Eshik.', 'Дверь.'),
      100, { unit: 'set', colors: ['white'] }),
    images: ['/img/products/dr-pn-elite-wht.webp'],
    status: 'rejected',
    moderationNote: 'Nom va tavsif juda qisqa, narx notoʻgʻri koʻrsatilgan. / Слишком короткое название и описание, неверная цена.'
  }
];

module.exports = { categories: categories(), brands, shops, pendingShop, products, pendingProducts };
