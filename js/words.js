/*
  CATEGORIAS DE PALAVRAS para o Jogo da Memória e o Jogo de Soletrar.
  Cada item tem:
  - img: imagem (usamos emoji, mas pode ser trocado por uma URL de imagem, ex: 'https://.../carro.png')
  - en: palavra em inglês
  - pt: tradução em português
  Adicione quantas categorias e itens quiser.
*/
const WORD_CATEGORIES = [
  {
    id: 'transporte',
    name: 'Transporte',
    items: [
      { img: '🚗', en: 'car', pt: 'carro' },
      { img: '🚌', en: 'bus', pt: 'ônibus' },
      { img: '🚲', en: 'bicycle', pt: 'bicicleta' },
      { img: '✈️', en: 'airplane', pt: 'avião' },
      { img: '🚂', en: 'train', pt: 'trem' },
      { img: '🚁', en: 'helicopter', pt: 'helicóptero' }
    ]
  },
  {
    id: 'animais',
    name: 'Animais',
    items: [
      { img: '🐕', en: 'dog', pt: 'cachorro' },
      { img: '🐈', en: 'cat', pt: 'gato' },
      { img: '🐎', en: 'horse', pt: 'cavalo' },
      { img: '🐘', en: 'elephant', pt: 'elefante' },
      { img: '🐒', en: 'monkey', pt: 'macaco' },
      { img: '🦁', en: 'lion', pt: 'leão' }
    ]
  },
  {
    id: 'comida',
    name: 'Comida',
    items: [
      { img: '🍎', en: 'apple', pt: 'maçã' },
      { img: '🍌', en: 'banana', pt: 'banana' },
      { img: '🍇', en: 'grape', pt: 'uva' },
      { img: '🥖', en: 'bread', pt: 'pão' },
      { img: '🥛', en: 'milk', pt: 'leite' },
      { img: '🧀', en: 'cheese', pt: 'queijo' }
    ]
  },
  {
    id: 'corpo',
    name: 'Corpo humano',
    items: [
      { img: '👂', en: 'ear', pt: 'orelha' },
      { img: '👃', en: 'nose', pt: 'nariz' },
      { img: '🦷', en: 'tooth', pt: 'dente' },
      { img: '👋', en: 'hand', pt: 'mão' },
      { img: '🦵', en: 'leg', pt: 'perna' },
      { img: '👁️', en: 'eye', pt: 'olho' }
    ]
  },
  {
    id: 'casa',
    name: 'Casa',
    items: [
      { img: '🏠', en: 'house', pt: 'casa' },
      { img: '🛏️', en: 'bed', pt: 'cama' },
      { img: '🪑', en: 'chair', pt: 'cadeira' },
      { img: '🍽️', en: 'table', pt: 'mesa' },
      { img: '🚪', en: 'door', pt: 'porta' },
      { img: '🪟', en: 'window', pt: 'janela' }
    ]
  },
  {
    id: 'familia',
    name: 'Fam\u00edlia',
    items: [
      { img: '\ud83d\udc71', en: 'mother', pt: 'm\u00e3e' },
      { img: '\ud83d\udc76', en: 'father', pt: 'pai' },
      { img: '\ud83d\udc67', en: 'sister', pt: 'irm\u00e3' },
      { img: '\ud83d\udc68', en: 'brother', pt: 'irm\u00e3o' },
      { img: '\ud83d\udc74', en: 'grandmother', pt: 'av\u00f3' },
      { img: '\ud83d\udc75', en: 'grandfather', pt: 'av\u00f4' }
    ]
  },
  {
    id: 'cores',
    name: 'Cores',
    items: [
      { img: '🔴', en: 'red', pt: 'vermelho' },
      { img: '🔵', en: 'blue', pt: 'azul' },
      { img: '🟢', en: 'green', pt: 'verde' },
      { img: '🟡', en: 'yellow', pt: 'amarelo' },
      { img: '⚫', en: 'black', pt: 'preto' },
      { img: '⚪', en: 'white', pt: 'branco' }
    ]
  }
];
if (typeof window !== 'undefined') window.WORDS = WORD_CATEGORIES;
