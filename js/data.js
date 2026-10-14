/* Mamarracho — contenido del juego: frases, modos, avatares, colores. */
(function (M) {
  'use strict';
  const D = (M.D = {});

  D.MAX_PLAYERS = 12;
  D.START_MONEY = 1000;

  // Frases para el botón 🎲, para el modo Copión y para cuando alguien no escribe nada.
  D.PROMPTS = [
    'un perro astronauta comiendo una empanada', 'una vaca haciendo surf', 'un dinosaurio haciendo un asado',
    'una papa con anteojos de sol', 'un gato manejando un colectivo', 'un pingüino en bicicleta',
    'una abuela haciendo skate', 'un tiburón tomando mate', 'un fantasma con miedo a la oscuridad',
    'un alien jugando al fútbol', 'una pizza enamorada', 'un mono con traje de oficina',
    'un caracol muy apurado', 'una nube triste lloviendo sobre un señor', 'un robot aprendiendo a bailar',
    'un pulpo haciendo malabares', 'una hamburguesa gigante atacando la ciudad', 'un unicornio en la playa',
    'un caballo en el subte', 'un vampiro tomando sol a las tres de la tarde', 'un sapo con corona',
    'un huevo frito tomando sol', 'una banana detective', 'un elefante escondido detrás de un árbol',
    'un pollo levantando pesas', 'un león en la peluquería', 'una heladera llena de gatos',
    'una medusa con paraguas', 'un oso polar muerto de calor', 'un zombie en una entrevista de trabajo',
    'una ballena en una pileta de lona', 'un perro paseando a su dueño', 'una cebolla haciendo llorar a todos',
    'un ratón persiguiendo a un gato', 'una jirafa con bufanda', 'un pirata en el supermercado',
    'un cohete hecho de salchichas', 'un mago que se olvidó el truco', 'un pez con snorkel fuera del agua',
    'una planta que come hamburguesas', 'un murciélago colgado de una lámpara', 'un ninja en la fila del banco',
    'una gallina poniendo un huevo de oro', 'un hámster corriendo una maratón', 'una sirena atrapada en una pecera',
    'un dragón resfriado', 'un caballero peleando contra una mosca', 'un bebé manejando un tractor',
    'un cactus que quiere dar un abrazo', 'un señor bañándose en una taza de café', 'una hormiga cargando una sandía',
    'un gato en la luna', 'un globo escapándose de un nene', 'un perro con zapatillas nuevas',
    'un castillo de arena derrumbándose', 'un mosquito gigante', 'una tostada quemada pidiendo perdón',
    'un muñeco de nieve en el desierto', 'una abeja trabajando en una oficina', 'un payaso triste',
    'un camello en la nieve', 'una momia desenrollándose', 'un pato con mochila',
    'un tren con patas', 'una vaca en un ascensor', 'una sandía con anteojos',
    'una araña tejiendo una bufanda', 'un rey buscando su corona', 'un lobo disfrazado de oveja',
    'un auto volando sobre la ciudad', 'un chef persiguiendo a un pollo', 'un esqueleto tomando leche',
    'un perro jugando a la Play', 'un sándwich de milanesa gigante', 'un abuelo con guitarra eléctrica',
    'una papa frita en el gimnasio', 'un tigre vegetariano', 'una nave espacial aterrizando en el patio',
    'un koala dormido en clase', 'un ovni robándose una vaca', 'un ananá con peluca',
    'un pez payaso contando chistes', 'un perro salchicha larguísimo', 'un caracol con turbo',
    'una flor bailando bajo la lluvia', 'un volcán estornudando', 'un sol con anteojos de sol',
    'la luna comiendo queso', 'un dentista con miedo a los dientes', 'una oveja contando personas para dormir',
    'un bombero apagando una torta de cumpleaños', 'un fantasma lavando su sábana', 'un hipopótamo bailarín',
    'un mate con piernas', 'un colectivo lleno de patos', 'una milanesa a caballo',
    'un frasco de dulce de leche gigante', 'un gaucho en el espacio', 'un perro pidiendo un deseo',
    'una tormenta adentro de una casa', 'un árbol con zapatillas', 'un chancho volando con alas',
    'un buzo encontrando un tesoro', 'un cangrejo caminando para adelante', 'una lámpara mágica con wifi',
    'un hombre lobo en la peluquería', 'una cucaracha con casco', 'un rinoceronte en patineta',
    'una vaca mirando la tele', 'un caballo en la pileta', 'un perro con miedo a los gatos',
    'una pelota de fútbol cansada', 'un panda haciendo yoga', 'un camaleón que no sabe qué color ponerse',
    'un astronauta perdido en el súper', 'una tortuga en una carrera de autos', 'un cocodrilo en el dentista',
    'una montaña rusa para hormigas', 'una oreja gigante escuchando un secreto', 'un sombrero que se vuela con el viento',
    'un detective buscando su lupa', 'una mariposa con bigotes', 'un loro que no para de hablar',
    'un viejito en monopatín eléctrico', 'una manzana con un gusano adentro', 'un pingüino en el desierto',
    'un rayo enojado', 'un fideo larguísimo', 'un mosquito tomando con sorbete',
    'un señor atrapado en un frasco', 'una gallina cruzando la calle', 'un perro en la luna aullándole a la Tierra',
    'un ladrón robándose una nube', 'un monstruo con miedo debajo de la cama', 'un pájaro con auriculares',
    'un tiburón vegetariano', 'una ardilla con una nuez gigante', 'un gato trepado al árbol de Navidad',
    'un pescador que pescó una bota', 'una oruga con zapatillas', 'un robot regando plantas',
    'una calabaza de mal humor', 'un sapo besando a una princesa', 'un globo terráqueo mareado',
    'un profe dormido en su propia clase', 'una vaca con anteojos leyendo el diario', 'un yeti en ojotas',
  ];

  D.AVATARS = [
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
    '🐧', '🐤', '🦆', '🦉', '🐴', '🦄', '🐝', '🐞', '🐢', '🐙', '🦀', '🐳', '🦈', '🐊', '🦖', '🦕',
    '🐌', '🦔', '👽', '🤖', '👻', '🎃', '🤡', '💩', '🌵', '🍄', '🍕', '🥑', '🌮', '🍩',
  ];

  D.AVATAR_COLORS = ['#FFE14A', '#FF5C9D', '#3D7BFF', '#22C07A', '#FF8A2A', '#A77BFF', '#2EC4D6', '#FF6B57', '#B7E34B', '#F7A8D8'];

  // Paleta de dibujo. El índice viaja en los datos del dibujo: no cambiar el orden.
  D.PALETTE = [
    '#1E1B3A', '#7A7A8C', '#FFFFFF', '#E63946', '#FF8A2A', '#FFD23F',
    '#22C07A', '#167A4A', '#5BD1F5', '#3D7BFF', '#1B3A8C', '#9B6BFF',
    '#FF5C9D', '#FFB3D1', '#8B5A2B', '#F2C9A0', '#C9CCD6', '#7A1F2B',
  ];
  D.PALETTE_NAMES = [
    'Negro', 'Gris', 'Blanco', 'Rojo', 'Naranja', 'Amarillo',
    'Verde', 'Verde oscuro', 'Celeste', 'Azul', 'Azul marino', 'Violeta',
    'Rosa', 'Rosa claro', 'Marrón', 'Piel', 'Gris claro', 'Bordó',
  ];
  D.WHITE = 2;
  D.SIZES = [3, 8, 16, 32];
  D.SIZE_NAMES = ['Fino', 'Mediano', 'Grueso', 'Enorme'];

  D.MODES = {
    clasico: {
      id: 'clasico', icon: '📞', name: 'Clásico',
      short: 'Escribí, dibujá, adiviná… ¡y mirá cómo se deforma todo!',
      variant: 'normal',
    },
    copion: {
      id: 'copion', icon: '🙈', name: 'Copión',
      short: 'Mirás un dibujo unos segundos y lo copiás de memoria.',
      variant: 'normal',
    },
    invisible: {
      id: 'invisible', icon: '👻', name: 'Tinta invisible',
      short: 'Como el Clásico, pero la tinta se borra mientras dibujás.',
      variant: 'invisible',
    },
    trazo: {
      id: 'trazo', icon: '〰️', name: 'Un solo trazo',
      short: 'Como el Clásico, pero sin levantar el lápiz ni una vez.',
      variant: 'onestroke',
    },
    monstruo: {
      id: 'monstruo', icon: '🧟', name: 'Monstruo por partes',
      short: 'Cabeza, cuerpo y piernas: cada uno dibuja una parte sin ver el resto.',
      variant: 'normal',
    },
  };
  D.MODE_ORDER = ['clasico', 'copion', 'invisible', 'trazo', 'monstruo'];

  // Segundos por tipo de tarea.
  D.SPEEDS = {
    tranqui: { id: 'tranqui', icon: '🐢', name: 'Tranqui', write: 60, draw: 120, guess: 50, memo: 10, part: 100 },
    normal: { id: 'normal', icon: '🙂', name: 'Normal', write: 40, draw: 80, guess: 35, memo: 7, part: 70 },
    rapido: { id: 'rapido', icon: '⚡', name: 'Rápido', write: 25, draw: 40, guess: 20, memo: 5, part: 40 },
  };
  D.SPEED_ORDER = ['tranqui', 'normal', 'rapido'];

  D.PART_NAMES = ['la CABEZA', 'el CUERPO', 'las PIERNAS'];
  D.PART_LABELS = ['Cabeza', 'Cuerpo', 'Piernas'];

  D.REACTIONS = ['😂', '🔥', '😍', '💀', '🤢'];

  // El tasador revela el valor real de cada obra después de venderla.
  D.TASADOR = [
    { m: 0, w: 10, title: '¡ES FALSO!', line: 'Es una falsificación. No vale ni un mango.', tone: 'bad' },
    { m: 0.5, w: 16, title: 'x0,5', line: 'Tiene una mancha de mate. Vale la mitad.', tone: 'bad' },
    { m: 1, w: 30, title: 'x1', line: 'Precio justo. Ni más ni menos.', tone: 'meh' },
    { m: 1.5, w: 20, title: 'x1,5', line: '¡Buena compra! Vale un 50% más.', tone: 'good' },
    { m: 2, w: 16, title: 'x2', line: '¡Arte de culto! Vale el doble.', tone: 'good' },
    { m: 3, w: 8, title: 'x3', line: '¡OBRA MAESTRA! Vale el triple.', tone: 'great' },
  ];

  const MONSTER_A = ['Don', 'Sir', 'El temible', 'El gran', 'Capitán', 'El tío', 'El profe', 'El doctor', 'El pequeño', 'El maestro'];
  const MONSTER_B = ['Ñoqui', 'Pepino', 'Mondongo', 'Chorizo', 'Alfajor', 'Zapallo', 'Bizcocho', 'Fideo', 'Choclo', 'Tornillo',
    'Pancho', 'Repollo', 'Garbanzo', 'Tallarín', 'Membrillo', 'Pochoclo', 'Matambre', 'Ravioli'];
  const MONSTER_C = ['Galáctico', 'Furioso', 'Saltarín', 'Pegajoso', 'del Infierno', 'con Rulos', 'Explosivo', 'Malhumorado',
    'Volador', 'Tóxico', 'Bailarín', 'Dormilón', 'sin Cuello', 'de las Sombras', 'Cósmico', 'Rabioso'];
  D.monsterName = () => {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    return pick(MONSTER_A) + ' ' + pick(MONSTER_B) + ' ' + pick(MONSTER_C);
  };

  D.randomPrompt = (avoid) => {
    for (let i = 0; i < 6; i++) {
      const p = D.PROMPTS[Math.floor(Math.random() * D.PROMPTS.length)];
      if (!avoid || !avoid.has(p)) return p;
    }
    return D.PROMPTS[Math.floor(Math.random() * D.PROMPTS.length)];
  };
})(globalThis.M = globalThis.M || {});
