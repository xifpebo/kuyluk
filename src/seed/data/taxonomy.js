'use strict';

/**
 * Demo category tree and brands for Stroy Bazar.
 * Parents group the catalog; products are always attached to a subcategory.
 * Brand names are fictional.
 */

const L = (uz, ru) => ({ uz, ru });

const tree = [
  {
    slug: 'bathroom',
    icon: 'bath',
    name: L('Santexnika va vannaxona', 'Сантехника и ванная'),
    description: L('Unitazlar, rakovinalar, vannalar, dush tizimlari va vannaxona mebeli.', 'Унитазы, раковины, ванны, душевые системы и мебель для ванной.'),
    children: [
      ['toilets', 'toilet', L('Unitazlar', 'Унитазы'), L('Pol va osma unitazlar, kompaktlar.', 'Напольные и подвесные унитазы, компакты.')],
      ['installations', 'toilet', L('Installyatsiyalar', 'Инсталляции'), L('Osma unitazlar uchun ramalar va tugmalar.', 'Рамы и клавиши смыва для подвесных унитазов.')],
      ['sinks', 'sink', L('Rakovinalar', 'Раковины'), L('Ustki, osma va tumba uchun rakovinalar.', 'Накладные, подвесные и мебельные раковины.')],
      ['bathtubs', 'bath', L('Vannalar', 'Ванны'), L('Akril va erkin turuvchi vannalar.', 'Акриловые и отдельностоящие ванны.')],
      ['showers', 'shower', L('Dush tizimlari', 'Душевые системы'), L('Dush ustunlari, termostatlar va lekalar.', 'Душевые стойки, термостаты и лейки.')],
      ['shower-enclosures', 'shower', L('Dush kabinalari', 'Душевые кабины'), L('Shisha ograjdeniyalar va dush poddonlari.', 'Стеклянные ограждения и поддоны.')],
      ['bathroom-furniture', 'cabinet', L('Vannaxona mebeli', 'Мебель для ванной'), L('Rakovinali tumbalar va oynali shkafchalar.', 'Тумбы с раковиной и зеркальные шкафы.')],
      ['faucets', 'faucet', L('Smesitellar', 'Смесители'), L('Rakovina, vanna va dush uchun smesitellar.', 'Смесители для раковины, ванны и душа.')]
    ]
  },
  {
    slug: 'tiles',
    icon: 'tiles',
    name: L('Kafel va keramogranit', 'Плитка и керамогранит'),
    description: L('Devor va pol uchun keramik plitka, keramogranit va mozaika.', 'Керамическая плитка, керамогранит и мозаика для стен и пола.'),
    children: [
      ['ceramic-tiles', 'tiles', L('Keramik plitka', 'Керамическая плитка'), L('Vannaxona va oshxona devorlari uchun.', 'Для стен ванной и кухни.')],
      ['porcelain-tiles', 'tiles', L('Keramogranit', 'Керамогранит'), L('Pol va katta formatli keramogranit.', 'Напольный и крупноформатный керамогранит.')],
      ['mosaic', 'tiles', L('Mozaika va dekor', 'Мозаика и декор'), L('Olti burchakli, metro va dekor plitkalar.', 'Шестигранники, «кабанчик» и декор.')]
    ]
  },
  {
    slug: 'doors',
    icon: 'door',
    name: L('Eshiklar', 'Двери'),
    description: L('Ichki xona va kirish eshiklari, furnitura bilan.', 'Межкомнатные и входные двери с фурнитурой.'),
    children: [
      ['interior-doors', 'door', L('Ichki eshiklar', 'Межкомнатные двери'), L('Klassik va zamonaviy ichki eshiklar.', 'Классические и современные межкомнатные двери.')],
      ['entrance-doors', 'door', L('Kirish eshiklari', 'Входные двери'), L('Metall kirish eshiklari, termouzilishli.', 'Металлические входные двери, в т.ч. с терморазрывом.')]
    ]
  },
  {
    slug: 'paint',
    icon: 'paint',
    name: L('Boʻyoqlar va devor qoplamalari', 'Краски и обои'),
    description: L('Ichki va fasad boʻyoqlari, emallar, gruntovkalar va gulqogʻozlar.', 'Интерьерные и фасадные краски, эмали, грунтовки и обои.'),
    children: [
      ['wall-paint', 'paint', L('Devor boʻyoqlari', 'Краски для стен'), L('Yuviladigan va namga chidamli ichki boʻyoqlar.', 'Моющиеся и влагостойкие интерьерные краски.')],
      ['facade-paint', 'paint', L('Fasad boʻyoqlari', 'Фасадные краски'), L('Tashqi ishlar uchun boʻyoqlar.', 'Краски для наружных работ.')],
      ['enamels', 'paint', L('Emal va laklar', 'Эмали и лаки'), L('Metall, yogʻoch va radiatorlar uchun.', 'Для металла, дерева и радиаторов.')],
      ['primers', 'paint', L('Gruntovkalar', 'Грунтовки'), L('Chuqur singuvchi va kontakt gruntovkalar.', 'Глубокого проникновения и бетонконтакт.')],
      ['wallpaper', 'wallpaper', L('Gulqogʻozlar', 'Обои'), L('Flizelin va vinil gulqogʻozlar.', 'Флизелиновые и виниловые обои.')]
    ]
  },
  {
    slug: 'flooring',
    icon: 'floor',
    name: L('Pol qoplamalari', 'Напольные покрытия'),
    description: L('Parket, laminat, vinil pol va aksessuarlar.', 'Паркет, ламинат, виниловые полы и аксессуары.'),
    children: [
      ['parquet', 'floor', L('Parket', 'Паркет'), L('Massiv va injenerlik parket taxtasi.', 'Массивная и инженерная паркетная доска.')],
      ['laminate', 'floor', L('Laminat', 'Ламинат'), L('32–34 sinf laminat.', 'Ламинат 32–34 класса.')],
      ['vinyl-flooring', 'floor', L('Vinil (SPC) pol', 'Виниловый пол (SPC)'), L('Suvga chidamli kvarts-vinil pol.', 'Водостойкий кварцвинил.')],
      ['floor-accessories', 'floor', L('Plintus va podlojka', 'Плинтус и подложка'), L('Plintuslar, podlojkalar va profillar.', 'Плинтусы, подложки и пороги.')]
    ]
  },
  {
    slug: 'plumbing',
    icon: 'pipes',
    name: L('Quvurlar va armatura', 'Трубы и арматура'),
    description: L('Suv taʼminoti va kanalizatsiya uchun quvurlar, fitinglar va kranlar.', 'Трубы, фитинги и краны для водоснабжения и канализации.'),
    children: [
      ['water-pipes', 'pipes', L('Suv quvurlari (PPR)', 'Водопроводные трубы (PPR)'), L('Sovuq va issiq suv uchun PPR quvurlar.', 'Трубы PPR для холодной и горячей воды.')],
      ['sewer-pipes', 'pipes', L('Kanalizatsiya quvurlari', 'Канализационные трубы'), L('PVX va PP kanalizatsiya quvurlari.', 'Канализационные трубы ПВХ и ПП.')],
      ['fittings', 'pipes', L('Fitinglar', 'Фитинги'), L('Burchaklar, uchliklar, muftalar va oʻtkazgichlar.', 'Углы, тройники, муфты и переходники.')],
      ['valves', 'valve', L('Kranlar va ventillar', 'Краны и вентили'), L('Sharli kranlar, kollektorlar va shlanglar.', 'Шаровые краны, коллекторы и подводки.')]
    ]
  },
  {
    slug: 'heating',
    icon: 'heating',
    name: L('Isitish va suv isitgichlar', 'Отопление и водонагреватели'),
    description: L('Radiatorlar, qozonlar, suv isitgichlar va polotentsesushitellar.', 'Радиаторы, котлы, водонагреватели и полотенцесушители.'),
    children: [
      ['radiators', 'heating', L('Radiatorlar', 'Радиаторы'), L('Alyuminiy, bimetall va panel radiatorlar.', 'Алюминиевые, биметаллические и панельные радиаторы.')],
      ['boilers', 'heating', L('Isitish qozonlari', 'Котлы отопления'), L('Gaz va elektr qozonlar.', 'Газовые и электрические котлы.')],
      ['water-heaters', 'heater', L('Suv isitgichlar', 'Водонагреватели'), L('Jamgʻarma elektr suv isitgichlari.', 'Накопительные электроводонагреватели.')],
      ['towel-rails', 'heating', L('Polotentsesushitellar', 'Полотенцесушители'), L('Suvli va elektr polotentsesushitellar.', 'Водяные и электрические полотенцесушители.')]
    ]
  },
  {
    slug: 'electrical',
    icon: 'electrical',
    name: L('Elektr materiallari', 'Электротовары'),
    description: L('Kabel, rozetka va viklyuchatellar, avtomatlar.', 'Кабель, розетки и выключатели, автоматы.'),
    children: [
      ['cables', 'electrical', L('Kabel va simlar', 'Кабель и провод'), L('VVG va PVS mis kabellari.', 'Медный кабель ВВГ и провод ПВС.')],
      ['sockets-switches', 'electrical', L('Rozetka va viklyuchatellar', 'Розетки и выключатели'), L('Ichki montaj uchun mexanizmlar va ramkalar.', 'Механизмы и рамки скрытого монтажа.')],
      ['circuit-breakers', 'electrical', L('Avtomatlar va UZO', 'Автоматы и УЗО'), L('Modulli avtomatik oʻchirgichlar.', 'Модульные автоматические выключатели.')]
    ]
  },
  {
    slug: 'lighting',
    icon: 'lamp',
    name: L('Yoritish', 'Освещение'),
    description: L('LED panellar, osma chiroqlar va lampalar.', 'LED-панели, подвесные светильники и лампы.'),
    children: [
      ['ceiling-lights', 'lamp', L('Shift chiroqlari', 'Потолочные светильники'), L('LED panellar va downlightlar.', 'LED-панели и даунлайты.')],
      ['pendant-lights', 'lamp', L('Osma chiroqlar', 'Подвесные светильники'), L('Oshxona va zal uchun osma chiroqlar.', 'Подвесные светильники для кухни и гостиной.')],
      ['bulbs', 'lamp', L('Lampalar', 'Лампы'), L('Tejamkor LED lampalar.', 'Энергосберегающие LED-лампы.')]
    ]
  },
  {
    slug: 'building-materials',
    icon: 'blocks',
    name: L('Qurilish materiallari', 'Стройматериалы'),
    description: L('Sement, quruq aralashmalar, gipsokarton, gʻisht, bloklar va izolyatsiya.', 'Цемент, сухие смеси, гипсокартон, кирпич, блоки и утеплители.'),
    children: [
      ['cement', 'cement', L('Sement va aralashmalar', 'Цемент и смеси'), L('Portlandsement, shtukaturka va shpaklyovka.', 'Портландцемент, штукатурки и шпаклёвки.')],
      ['drywall', 'drywall', L('Gipsokarton va profil', 'Гипсокартон и профиль'), L('GKL, GKLV listlar va metall profillar.', 'Листы ГКЛ, ГКЛВ и металлопрофиль.')],
      ['bricks-blocks', 'blocks', L('Gʻisht va bloklar', 'Кирпич и блоки'), L('Pishgan va yuzaki gʻisht, gazoblok.', 'Керамический и облицовочный кирпич, газоблок.')],
      ['insulation', 'insulation', L('Issiqlik izolyatsiyasi', 'Утеплители'), L('Mineral paxta va XPS plitalar.', 'Минвата и плиты XPS.')]
    ]
  },
  {
    slug: 'adhesives-sealants',
    icon: 'tube',
    name: L('Yelim va germetiklar', 'Клеи и герметики'),
    description: L('Plitka yelimi, silikon germetiklar va montaj koʻpigi.', 'Плиточный клей, силиконовые герметики и монтажная пена.'),
    children: [
      ['tile-adhesive', 'cement', L('Plitka yelimi va zatirka', 'Плиточный клей и затирка'), L('Plitka va keramogranit uchun yelimlar.', 'Клеи для плитки и керамогранита.')],
      ['sealants', 'tube', L('Germetiklar', 'Герметики'), L('Silikon, akril va poliuretan germetiklar.', 'Силиконовые, акриловые и полиуретановые герметики.')],
      ['mounting-foam', 'tube', L('Montaj koʻpigi', 'Монтажная пена'), L('Professional va maishiy montaj koʻpigi.', 'Профессиональная и бытовая монтажная пена.')]
    ]
  },
  {
    slug: 'tools',
    icon: 'tools',
    name: L('Qurilish asboblari', 'Инструменты'),
    description: L('Elektr va qoʻl asboblari ustalar uchun.', 'Электро- и ручной инструмент для мастеров.'),
    children: [
      ['power-tools', 'tools', L('Elektr asboblar', 'Электроинструмент'), L('Drel, perforator va silliqlash mashinalari.', 'Дрели, перфораторы и шлифмашины.')],
      ['hand-tools', 'tools', L('Qoʻl asboblari', 'Ручной инструмент'), L('Shovun, kelma, bolgʻa va oʻlchov asboblari.', 'Уровни, шпатели, молотки и измерительный инструмент.')]
    ]
  },
  {
    slug: 'kitchen',
    icon: 'kitchen',
    name: L('Oshxona uchun', 'Для кухни'),
    description: L('Oshxona moykalari, smesitellar, stoleshnitsalar va vityajkalar.', 'Кухонные мойки, смесители, столешницы и вытяжки.'),
    children: [
      ['kitchen-sinks', 'sink', L('Oshxona moykalari', 'Кухонные мойки'), L('Zanglamaydigan poʻlat va granit moykalar.', 'Мойки из нержавеющей стали и гранита.')],
      ['kitchen-faucets', 'faucet', L('Oshxona smesitellari', 'Смесители для кухни'), L('Yuqori jumrakli va tortiladigan leykali.', 'С высоким изливом и выдвижной лейкой.')],
      ['countertops', 'kitchen', L('Stoleshnitsalar', 'Столешницы'), L('Kvars va sunʼiy toshdan stoleshnitsalar.', 'Столешницы из кварца и искусственного камня.')],
      ['range-hoods', 'kitchen', L('Vityajkalar', 'Вытяжки'), L('Gumbazsimon va qiya vityajkalar.', 'Купольные и наклонные вытяжки.')]
    ]
  },
  {
    slug: 'renovation',
    icon: 'roller',
    name: L('Taʼmirlash uchun mahsulotlar', 'Товары для ремонта'),
    description: L('Valiklar, choʻtkalar va boshqa taʼmirlash anjomlari.', 'Валики, кисти и другие расходники для ремонта.'),
    children: [
      ['painting-tools', 'roller', L('Boʻyash anjomlari', 'Малярный инструмент'), L('Valiklar, choʻtkalar va lotoklar.', 'Валики, кисти и кюветы.')],
      ['other', 'box', L('Boshqa', 'Другое'), L('Boshqa foydali mahsulotlar.', 'Прочие полезные товары.')]
    ]
  }
];

/** Flattened list: parents first (sortOrder 10, 20…), then children. */
function categories() {
  const out = [];
  tree.forEach((parent, i) => {
    out.push({ slug: parent.slug, icon: parent.icon, name: parent.name, description: parent.description, parent: null, sortOrder: (i + 1) * 10 });
    parent.children.forEach(([slug, icon, name, description], j) => {
      out.push({ slug, icon, name, description, parent: parent.slug, sortOrder: (i + 1) * 10 + j + 1 });
    });
  });
  return out;
}

const brands = [
  ['aquanova', 'Aquanova', 'TR'],
  ['santeko', 'Santeko', 'UZ'],
  ['vellmar', 'Vellmar', 'DE'],
  ['lavanda-ceramica', 'Lavanda Ceramica', 'ES'],
  ['kerama-orient', 'Kerama Orient', 'UZ'],
  ['marmo-italia', 'Marmo Italia', 'IT'],
  ['porta-nova', 'Porta Nova', 'UZ'],
  ['steelguard', 'SteelGuard', 'RU'],
  ['colorpro', 'ColorPro', 'UZ'],
  ['farbe-haus', 'Farbe Haus', 'DE'],
  ['dekor-art', 'Dekor Art', 'RU'],
  ['parkethaus', 'ParketHaus', 'AT'],
  ['floorwood', 'FloorWood', 'BY'],
  ['polypipe-uz', 'PolyPipe UZ', 'UZ'],
  ['flowtek', 'Flowtek', 'IT'],
  ['termoplus', 'TermoPlus', 'TR'],
  ['heatline', 'HeatLine', 'IT'],
  ['voltex', 'Voltex', 'CN'],
  ['lumina', 'Lumina', 'PL'],
  ['sementex', 'Sementex', 'UZ'],
  ['gipsar', 'Gipsar', 'UZ'],
  ['keramblok', 'KeramBlok', 'UZ'],
  ['termowool', 'TermoWool', 'RU'],
  ['fixmaster', 'FixMaster', 'TR'],
  ['ustapro', 'UstaPro', 'CN'],
  ['granitex', 'Granitex', 'DE'],
  ['cucina', 'Cucina', 'IT']
].map(([slug, name, country]) => ({ slug, name, country }));

module.exports = { tree, categories, brands, L };
