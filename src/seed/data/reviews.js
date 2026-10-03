'use strict';

/** Review texts used to populate the demo marketplace (written by "customers" in either language). */
const u = (text) => ({ lang: 'uz', text });
const r = (text) => ({ lang: 'ru', text });

const reviewPool = {
  5: [
    u('Sifati aʼlo, rasmdagidek keldi. Doʻkon bilan Telegramda yozishdim, tez javob berishdi.'),
    u('Narxi bozordagidan arzonroq chiqdi. Ustamiz ham maqtadi, tavsiya qilaman.'),
    u('Ikkinchi marta shu doʻkondan olyapman. Hammasi joyida, yetkazib berish ham oʻz vaqtida.'),
    u('Kvartiramizni taʼmirlashda ishlatdik, natijadan juda mamnunmiz.'),
    u('Sotuvchi hamma savollarimga sabr bilan javob berdi, mahsulot sifatli.'),
    r('Отличное качество, всё как на фото. Связался с магазином через Telegram — ответили за пять минут.'),
    r('Брали для ремонта квартиры, мастер остался доволен. Рекомендую.'),
    r('Цена ниже, чем в других магазинах, и есть в наличии. Забрали в тот же день.'),
    r('Уже второй раз заказываю в этом магазине — всё чётко, привезли вовремя.'),
    r('Продавец подробно проконсультировал по телефону, помог подобрать размер.')
  ],
  4: [
    u('Yaxshi mahsulot, faqat yetkazib berishni bir kun kutdik.'),
    u('Sifati yaxshi, narxi biroz qimmatroq, lekin bunga arziydi.'),
    u('Umuman mamnunman, qadoqlash yanada yaxshiroq boʻlishi mumkin edi.'),
    r('Хороший товар за свои деньги. Минус звезда за ожидание доставки.'),
    r('Качество нормальное, упаковка могла быть получше. В целом доволен.'),
    r('Всё устраивает, но пришлось подождать, пока привезут со склада.')
  ],
  3: [
    u('Oʻrtacha. Rang rasmdagidan biroz farq qiladi, lekin ishlatsa boʻladi.'),
    r('Нормально, но ожидал немного большего за такую цену.')
  ],
  2: [
    u('Bitta dona shikastlangan holda keldi, doʻkon almashtirib berdi.'),
    r('Один элемент пришёл с дефектом, магазин заменил, но пришлось съездить ещё раз.')
  ]
};

const shopReviewPool = {
  5: [
    u('Doʻkon xodimlari juda xushmuomala, hamma narsani tushuntirib berishdi. Narxlar ham maʼqul.'),
    u('Telefon qilganimda darhol javob berishdi, kerakli mahsulotni ajratib qoʻyishdi.'),
    u('Assortiment katta, hammasi bir joyda. Yetkazib berish tez.'),
    r('Очень вежливые консультанты, большой выбор. Доставили на следующий день.'),
    r('Позвонил — сразу ответили, отложили товар до вечера. Сервис на уровне.'),
    r('Покупаю здесь материалы для объектов уже год. Цены честные, всё в наличии.')
  ],
  4: [
    u('Yaxshi doʻkon, lekin dam olish kuni avtoturargoh topish qiyin.'),
    r('Хороший магазин, но в выходные много людей и приходится ждать.')
  ]
};

const reviewers = {
  uz: ['Aziz T.', 'Madina R.', 'Jasur K.', 'Shahnoza A.', 'Bobur M.', 'Dilnoza S.', 'Sardor Y.', 'Gulnora X.', 'Otabek N.', 'Nilufar I.', 'Rustam Q.', 'Feruza O.'],
  ru: ['Дмитрий П.', 'Елена В.', 'Сергей К.', 'Ольга М.', 'Тимур А.', 'Наталья С.', 'Алексей Г.', 'Ирина Б.', 'Рустам Х.', 'Анна Л.']
};

module.exports = { reviewPool, shopReviewPool, reviewers };
