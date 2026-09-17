/*
  BIBLIOTECA DE MUSICAS

  Como adicionar suas próprias músicas:
  1. Copie o arquivo .mp3 para a pasta "songs" (ex: songs/minha_musica.mp3)
  2. Adicione um novo objeto na lista SONGS abaixo com:
     - id: identificador único
     - title: nome da música
     - artist: artista / banda
     - level: nível (Iniciante / Intermediário / Avançado)
     - audio: caminho do arquivo, 'songs/nome.mp3'
              (deixe '' se não tiver arquivo - o app usa a voz do PC)
     - lyrics: letra em inglês, uma string por linha
     - transl: tradução em português, uma string por linha (na mesma ordem)

  As músicas de exemplo abaixo são de domínio público.
*/
const SONGS = [
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    artist: 'Canção infantil (domínio público)',
    level: 'Iniciante',
    beginner: true,
    audio: '',
    lyrics: [
      'Twinkle, twinkle, little star,',
      'How I wonder what you are!',
      'Up above the world so high,',
      'Like a diamond in the sky.',
      'Twinkle, twinkle, little star,',
      'How I wonder what you are!'
    ],
    transl: [
      'Brilha, brilha, pequenina estrela,',
      'Como eu me pergunto o que você é!',
      'Lá em cima, tão alto no mundo,',
      'Como um diamante no céu.',
      'Brilha, brilha, pequenina estrela,',
      'Como eu me pergunto o que você é!'
    ]
  },
  {
    id: 'oldmacdonald',
    title: 'Old MacDonald Had a Farm',
    artist: 'Canção infantil (domínio público)',
    level: 'Iniciante',
    beginner: true,
    audio: '',
    lyrics: [
      'Old MacDonald had a farm, E-I-E-I-O,',
      'And on his farm he had a cow, E-I-E-I-O.',
      'With a moo-moo here and a moo-moo there,',
      'Here a moo, there a moo, everywhere a moo-moo.',
      'Old MacDonald had a farm, E-I-E-I-O.'
    ],
    transl: [
      'O velho MacDonald tinha uma fazenda, EI-EI-O,',
      'E na fazenda ele tinha uma vaca, EI-EI-O.',
      'Com um "muuu" aqui e um "muuu" ali,',
      'Aqui um "muuu", ali um "muuu", em todo lugar um "muuu".',
      'O velho MacDonald tinha uma fazenda, EI-EI-O.'
    ]
  },
  {
    id: 'headshoulders',
    title: 'Head, Shoulders, Knees and Toes',
    artist: 'Canção infantil (domínio público)',
    level: 'Iniciante',
    beginner: true,
    audio: '',
    lyrics: [
      'Head, shoulders, knees and toes,',
      'Knees and toes.',
      'Head, shoulders, knees and toes,',
      'Knees and toes.',
      'And eyes, and ears, and mouth, and nose.',
      'Head, shoulders, knees and toes,',
      'Knees and toes.'
    ],
    transl: [
      'Cabeça, ombros, joelhos e pés,',
      'Joelhos e pés.',
      'Cabeça, ombros, joelhos e pés,',
      'Joelhos e pés.',
      'E olhos, e orelhas, e boca, e nariz.',
      'Cabeça, ombros, joelhos e pés,',
      'Joelhos e pés.'
    ]
  }
];