'use strict';

const L = (uz, ru) => ({ uz, ru });
const S = (labelUz, labelRu, valueUz, valueRu = valueUz) => ({ label: L(labelUz, labelRu), value: L(valueUz, valueRu) });

/* Frequently used specification rows. */
const spec = {
  size: (v) => S('Oʻlchamlari', 'Размеры', v),
  material: (uz, ru) => S('Material', 'Материал', uz, ru),
  country: (uz, ru) => S('Ishlab chiqaruvchi mamlakat', 'Страна производства', uz, ru),
  warranty: (years) => S('Kafolat', 'Гарантия', `${years} yil`, `${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`),
  weight: (kg) => S('Ogʻirligi', 'Вес', `${kg} kg`, `${kg} кг`),
  volume: (l) => S('Hajmi', 'Объём', `${l} l`, `${l} л`),
  thickness: (mm) => S('Qalinligi', 'Толщина', `${mm} mm`, `${mm} мм`),
  coverage: (uz, ru) => S('Sarfi', 'Расход', uz, ru),
  power: (w) => S('Quvvati', 'Мощность', w),
  finish: (uz, ru) => S('Qoplama', 'Покрытие', uz, ru),
  install: (uz, ru) => S('Oʻrnatish turi', 'Тип монтажа', uz, ru),
  pack: (uz, ru) => S('Qadoqda', 'В упаковке', uz, ru),
  cls: (v) => S('Ishqalanishga chidamlilik sinfi', 'Класс износостойкости', v)
};

const COUNTRY = {
  UZ: ['Oʻzbekiston', 'Узбекистан'],
  TR: ['Turkiya', 'Турция'],
  DE: ['Germaniya', 'Германия'],
  IT: ['Italiya', 'Италия'],
  ES: ['Ispaniya', 'Испания'],
  RU: ['Rossiya', 'Россия'],
  CN: ['Xitoy', 'Китай'],
  PL: ['Polsha', 'Польша'],
  AT: ['Avstriya', 'Австрия'],
  BY: ['Belarus', 'Беларусь']
};
const made = (code) => spec.country(...COUNTRY[code]);

/**
 * Product factory. `photo` describes the procedural studio shot rendered by
 * tools/render (model function + arguments + camera); `photos` adds extra angles.
 */
function P(sku, shop, category, brand, name, description, price, opts = {}) {
  return {
    sku,
    shop,
    category,
    brand,
    name,
    description,
    price,
    oldPrice: opts.oldPrice ?? null,
    unit: opts.unit || 'piece',
    colors: opts.colors || [],
    sizes: opts.sizes || [],
    specs: opts.specs || [],
    stock: opts.stock || { status: 'in_stock', quantity: opts.qty ?? 12 },
    leadTimeDays: opts.leadTimeDays || 0,
    isFeatured: Boolean(opts.featured),
    photo: opts.photo,
    photos: opts.photos || [],
    status: opts.status || 'approved'
  };
}

module.exports = { L, S, spec, made, P };
