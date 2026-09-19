/*
  ENSINANDO POR FRASE
  Cada item: frase curta e memoravel com a palavra-alvo em destaque.
  O texto em portugues usa escapes \\uXXXX (ascii puro) para o navegador renderizar os acentos.
  - en: frase completa em ingles
  - word: palavra-alvo da categoria
  - pt: traducao em portugues
*/
const FRASES_CATEGORIAS = [
  {
    id: 'transporte',
    name: 'Transporte',
    items: [
      { en: 'I drive a car to work every day.', word: 'car', pt: 'Eu dirijo um carro para o trabalho todos os dias.' },
      { en: 'The bus is late today.', word: 'bus', pt: 'O \\u00f4nibus est\\u00e1 atrasado hoje.' },
      { en: 'She rides a bicycle in the park.', word: 'bicycle', pt: 'Ela anda de bicicleta no parque.' },
      { en: 'The airplane flies very high.', word: 'airplane', pt: 'O avi\\u00e3o voa muito alto.' },
      { en: 'We take the train to the city.', word: 'train', pt: 'N\\u00f3s pegamos o trem para a cidade.' },
      { en: 'The helicopter lands on the roof.', word: 'helicopter', pt: 'O helic\\u00f3ptero pousa no telhado.' }
    ]
  },
  {
    id: 'animais',
    name: 'Animais',
    items: [
      { en: 'The dog barks at night.', word: 'dog', pt: 'O cachorro late \\u00e0 noite.' },
      { en: 'My cat sleeps all day.', word: 'cat', pt: 'Meu gato dorme o dia todo.' },
      { en: 'The horse runs very fast.', word: 'horse', pt: 'O cavalo corre muito r\\u00e1pido.' },
      { en: 'The elephant has a long trunk.', word: 'elephant', pt: 'O elefante tem uma tromba comprida.' },
      { en: 'The monkey eats a banana.', word: 'monkey', pt: 'O macaco come uma banana.' },
      { en: 'The lion is the king of the jungle.', word: 'lion', pt: 'O le\\u00e3o \\u00e9 o rei da selva.' }
    ]
  },
  {
    id: 'comida',
    name: 'Comida',
    items: [
      { en: 'I eat an apple every morning.', word: 'apple', pt: 'Eu como uma ma\\u00e7\\u00e3 todas as manh\\u00e3s.' },
      { en: 'She likes a ripe banana.', word: 'banana', pt: 'Ela gosta de banana madura.' },
      { en: 'The grape is sweet and small.', word: 'grape', pt: 'A uva \\u00e9 doce e pequena.' },
      { en: 'This bread is fresh and warm.', word: 'bread', pt: 'Este p\\u00e3o est\\u00e1 fresquinho e quentinho.' },
      { en: 'I drink a glass of milk.', word: 'milk', pt: 'Eu bebo um copo de leite.' },
      { en: 'The cheese is on the table.', word: 'cheese', pt: 'O queijo est\\u00e1 sobre a mesa.' }
    ]
  },
  {
    id: 'casa',
    name: 'Casa',
    items: [
      { en: 'My house is near the beach.', word: 'house', pt: 'Minha casa fica perto da praia.' },
      { en: 'Please close the door.', word: 'door', pt: 'Por favor, feche a porta.' },
      { en: 'The window is open.', word: 'window', pt: 'A janela est\\u00e1 aberta.' },
      { en: 'Look at the mirror on the wall.', word: 'mirror', pt: 'Olhe para o espelho na parede.' },
      { en: 'I sleep in my bed.', word: 'bed', pt: 'Eu durmo na minha cama.' },
      { en: 'Turn on the lamp, please.', word: 'lamp', pt: 'Acenda a l\\u00e2mpada, por favor.' }
    ]
  },
  {
    id: 'cores',
    name: 'Cores',
    items: [
      { en: 'The apple is red.', word: 'red', pt: 'A ma\\u00e7\\u00e3 \\u00e9 vermelha.' },
      { en: 'The sky is very blue today.', word: 'blue', pt: 'O c\\u00e9u est\\u00e1 muito azul hoje.' },
      { en: 'The grass is green.', word: 'green', pt: 'A grama \\u00e9 verde.' },
      { en: 'The sun is yellow.', word: 'yellow', pt: 'O sol \\u00e9 amarelo.' },
      { en: 'My car is black.', word: 'black', pt: 'Meu carro \\u00e9 preto.' },
      { en: 'The orange is orange.', word: 'orange', pt: 'A laranja \\u00e9 laranja.' }
    ]
  }
];
