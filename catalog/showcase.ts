// The showcase products (docs/adr/0007-catalog-data-model.md): one per
// category, chosen by the owner on 2026-11-13 (issue #98). They are the only
// products that store a name and a description; the generator loads the
// French source, and the translation job fills the other languages.
//
// Names do not repeat the brand, which differs between the small and full
// catalogs. Texts do not name an appliance type either: a product's
// compatible models are of every type, and the page lists them.

export type ShowcaseProduct = {
  /** The product's id, the same at every scale and seed. */
  id: number;
  /** The category the product keeps at every seed, so its text fits it. */
  categoryId: number;
  /** The French source text. */
  fr: { name: string; description: string };
};

export const showcaseProducts: readonly ShowcaseProduct[] = [
  {
    id: 27,
    categoryId: 1,
    fr: {
      name: "Courroie de tambour poly-V 1270 J5",
      description:
        "Courroie striée à cinq nervures, longueur 1 270 mm, qui transmet le mouvement du moteur à la poulie. Son caoutchouc armé de fibres garde sa tension sans patiner, même à pleine charge. Une courroie qui claque, sent le brûlé ou laisse le tambour immobile alors que le moteur tourne est à remplacer. Le montage se fait sans outil spécial : on engage la courroie sur la poulie du moteur, puis on la fait rouler sur la grande poulie en tournant à la main.",
    },
  },
  {
    id: 54,
    categoryId: 2,
    fr: {
      name: "Joint de porte en caoutchouc souple",
      description:
        "Joint d'étanchéité en caoutchouc souple, moulé d'une seule pièce, qui assure l'étanchéité de la porte une fois fermée. Ses replis évacuent l'eau vers la cuve et limitent les dépôts. Fissuré, déchiré ou durci, il laisse passer l'eau et les odeurs : son remplacement évite une fuite au sol. Le joint se pose sur sa lèvre d'origine et se maintient par un collier fourni.",
    },
  },
  {
    id: 43,
    categoryId: 3,
    fr: {
      name: "Pompe de vidange 30 W avec préfiltre",
      description:
        "Pompe de vidange synchrone de 30 W, avec un corps démontable et un préfiltre qui retient les petits objets avant la turbine. Elle évacue l'eau en fin de cycle, sans à-coups et avec peu de bruit. Si l'eau stagne au fond de la cuve ou si un bourdonnement se fait entendre sans écoulement, la pompe est souvent en cause. Elle se fixe par trois vis et se branche sur le connecteur existant.",
    },
  },
  {
    id: 67,
    categoryId: 4,
    fr: {
      name: "Résistance chauffante blindée 2 000 W",
      description:
        "Résistance blindée en acier inoxydable de 2 000 W, avec sa sonde de température et son joint de serrage. Elle chauffe l'eau ou l'air jusqu'à la température demandée par le programme. Une résistance entartrée ou coupée laisse le linge froid ou déclenche le disjoncteur. Avant le montage, il suffit de vérifier la longueur et la position des cosses, puis de serrer l'écrou central jusqu'à l'écrasement du joint.",
    },
  },
  {
    id: 33,
    categoryId: 5,
    fr: {
      name: "Cartouche filtrante à charbon actif",
      description:
        "Cartouche filtrante au charbon actif qui retient le chlore, les mauvais goûts et les particules fines. Elle se change tous les six mois environ, ou plus tôt si le débit baisse. Le corps quart de tour se verrouille d'un geste, sans outil ni coupure d'eau prolongée. Après la pose, laisser couler quelques litres pour purger l'air et les fines de charbon.",
    },
  },
  {
    id: 28,
    categoryId: 6,
    fr: {
      name: "Thermostat à bulbe capillaire réglable",
      description:
        "Thermostat mécanique à bulbe capillaire, réglable en sept positions, qui commande la mise en marche et l'arrêt du chauffage ou du froid. Le capillaire se glisse dans son logement d'origine pour mesurer la température au bon endroit. Un appareil qui ne s'arrête plus, ou ne démarre plus, a souvent un thermostat défaillant. Les cosses se rebranchent une à une, en suivant le câblage de l'ancienne pièce.",
    },
  },
  {
    id: 39,
    categoryId: 7,
    fr: {
      name: "Moteur universel à charbons 1 400 tr/min",
      description:
        "Moteur universel à charbons, livré avec sa poulie et son connecteur, pour une vitesse maximale de 1 400 tours par minute. Son tachymètre intégré permet à la carte de régler la vitesse avec précision. Des étincelles, une odeur de brûlé ou un moteur qui tourne par à-coups annoncent souvent des charbons usés ou un bobinage fatigué. Il se fixe sur ses deux silentblocs et se monte en une demi-heure.",
    },
  },
  {
    id: 7,
    categoryId: 8,
    fr: {
      name: "Module de commande électronique programmé",
      description:
        "Module de commande électronique livré programmé, prêt à être branché. Il pilote le moteur, le chauffage et les vannes selon le programme choisi, et affiche les codes d'erreur. Un appareil qui ne répond plus, redémarre seul ou affiche un code de panne de la carte peut retrouver une vie normale sans être remplacé. Les connecteurs sont détrompés : chacun ne se branche qu'à sa place.",
    },
  },
  {
    id: 17,
    categoryId: 9,
    fr: {
      name: "Charnière de porte à ressort, la paire",
      description:
        "Paire de charnières à ressort en acier zingué, qui tiennent la porte en position et en amortissent la fermeture. Une porte qui tombe d'un coup, ne reste plus entrouverte ou ferme mal sur son joint a souvent une charnière cassée. Les deux charnières se changent ensemble, pour un effort égal de chaque côté. Elles se posent avec les vis d'origine.",
    },
  },
  {
    id: 1,
    categoryId: 10,
    fr: {
      name: "Bouton de programmateur universel, axe 6 mm",
      description:
        "Bouton de commande universel, pour un axe de 6 mm à méplat, en plastique résistant à la chaleur. Sa forme simple et son repère gravé s'accordent à la plupart des façades, d'où sa compatibilité avec un très grand nombre de modèles. Un bouton fendu tourne dans le vide ou ne tient plus sur l'axe : celui-ci s'enfonce à la main, sans outil. Trois bagues d'adaptation sont fournies pour les axes un peu plus fins.",
    },
  },
  {
    id: 8,
    categoryId: 11,
    fr: {
      name: "Ampoule 25 W E14, résistante à 300 °C",
      description:
        "Ampoule à incandescence de 25 W, culot E14, conçue pour supporter jusqu'à 300 °C sans noircir ni éclater. Elle éclaire l'intérieur de l'appareil d'une lumière chaude qui ne déforme pas les couleurs. Avant le remplacement, couper le courant et laisser refroidir, puis dévisser le cabochon de protection. Une ampoule ordinaire ne tiendrait pas la chaleur et ne doit pas la remplacer.",
    },
  },
  {
    id: 34,
    categoryId: 12,
    fr: {
      name: "Panier à roulettes en fil plastifié",
      description:
        "Panier coulissant en fil d'acier plastifié, monté sur quatre roulettes, avec des rangées de picots rabattables. Il glisse sur ses rails sans accrocher et se sort entièrement pour le chargement. Un revêtement écaillé finit par rouiller et marquer la vaisselle : le panier se change en entier, sans démontage, en le posant sur ses rails.",
    },
  },
];
