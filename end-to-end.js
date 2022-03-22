const fileReader = require("./src/commons/file-utils");
const imageConverter = require('./src/image-converter');
const tibiaDatLoader = require('./src/dat-loader');
const tibiaCwmPacker = require('./src/cwm-packer');
const tibiaSprUnpacker = require('./src/spr-unpacker');
const { log, readEnvArray } = require("./src/commons/utils");
const dotenv = require('dotenv');

dotenv.config();

const outfits = readEnvArray('OUTFITS').map(({id, directory}) => {
  return {outfitId: id, directory};
});

const flokiItems = readEnvArray('ITEMS');
const ITEMS_OFFSET = 99;

const { PROCESSED_IMAGES_DIR, BINARIES_PUBLISH_DIR, ORIGINAL_TIBIA_DAT_DIR, ORIGINAL_TIBIA_SPR_DIR, UNPACKED_SPR_DIR } = process.env;
let NEW_IMAGE_START_ID = parseInt(process.env.NEW_IMAGE_START_ID);
const NEW_LOOKTYPE_START_ID = parseInt(process.env.NEW_LOOKTYPE_START_ID);
const NEW_ITEM_START_ID = parseInt(process.env.NEW_ITEM_START_ID) - ITEMS_OFFSET;
const SPRITE_SIZE = parseInt(process.env.SPRITE_SIZE);
const UNPACK_SPR = process.env.UNPACK_SPR === "true";
const SINGLE_OUTFIT_SPRITES = 12;

// up (1, 5, 9) - right (2, 6, 10) - down (3, 7, 11) - left (4, 8, 12)
const imageNamesMappings = [
    { from: 41, to: 1 },  // up 1
    { from: 21, to: 2 },  // right 1
    { from: 11, to: 3 },  // down 1
    { from: 31, to: 4 },  // left 1
    { from: 42, to: 5 },  // up 2
    { from: 22, to: 6 },  // right 2
    { from: 12, to: 7 },  // down 2
    { from: 32, to: 8 },  // left 2
    { from: 43, to: 9 },  // up 3
    { from: 23, to: 10 },  // right 3
    { from: 13, to: 11 }, // down 3
    { from: 33, to: 12 }, // left 3
]

const OUTFIT_TEMPLATE = {
  width: 1,
  height: 1,
  skip: 0,
  blend: 1,
  xdiv: 4,
  ydiv: 1,
  unkn: 1,
  anim: 3,
  properties: [],
  type: 'creature',
  id: 0,
  typeId: 0
}

const createOutfitDefinition = (id) => {
  const firstSprite = calculateOutfitSpriteId(id);
  const sprites = [];
  for (let i=0; i<SINGLE_OUTFIT_SPRITES; i++) {
    sprites.push(firstSprite + i);
  }
  return { ...OUTFIT_TEMPLATE, sprites }
}

const calculateOutfitSpriteId = (outfitId, imageId) => {
  const { to } = imageNamesMappings.find(({from}) => from === imageId) || { to: 1};
  return NEW_IMAGE_START_ID + (outfitId - 1) * SINGLE_OUTFIT_SPRITES + to;
}

const loadOutfitMetaData = ({ outfitId, directory }) => fileReader.getFilesFromDir(directory)
.filter(f => f.toLowerCase().endsWith("png"))
.map(fileName => {
  const tmp = fileName.split(".");
  const id = parseInt(tmp[0]);
  return {
    spriteId: calculateOutfitSpriteId(outfitId, id),
    id,
    outfitId,
    directory,
    fileName
  }
});

const normalizeImage = async ({ spriteId, directory, fileName }) => {
  const sourceFile = `${directory}/${fileName}`;
  const destinationFile = `${PROCESSED_IMAGES_DIR}/${spriteId}.png`
  await imageConverter.convertFile(sourceFile, destinationFile, { size: SPRITE_SIZE });
  return spriteId;
}

const addItems = async (data) => {
  const lastItem = data.items.pop();
  const { items } = data;
  while (items.length < NEW_ITEM_START_ID) {
    items.push(items[items.length-1]);
  }

  for (const { directory } of flokiItems) {
    const definition = require(`${directory}/item.json`);
    const sprites = [];
    for (const sprite of definition.sprites) {
      const spriteId = ++NEW_IMAGE_START_ID;
      const id = await normalizeImage({ spriteId, directory, fileName: `${sprite}.bmp` });
      sprites.push(id);
    }
    definition.sprites = sprites;
    items.push(definition);
  }

  items.push(lastItem);
  data.items = items;
}

const addOutfits = async (data) => {
  const lastCreature = data.creatures.pop();
  const { creatures } = data;
  while (creatures.length < NEW_LOOKTYPE_START_ID) {
    creatures.push(creatures[creatures.length-1]);
  }
  
  fileReader.createDir(PROCESSED_IMAGES_DIR);
  for (const outfit of outfits) {
    const images = loadOutfitMetaData(outfit);
    for (const image of images) {
      await normalizeImage(image);
    }
    creatures.push(createOutfitDefinition(outfit.outfitId));
  }
  creatures.push(lastCreature);
  data.creatures = creatures;
}

(async() => {

  log(`Starting end to end`)
  
  if (UNPACK_SPR) {
    log(`Unpacking tibia.spr`)
    await tibiaSprUnpacker.extract(ORIGINAL_TIBIA_SPR_DIR, UNPACKED_SPR_DIR)
    log(`Original tibia.spr extracted`)
    await imageConverter.convertToPng(UNPACKED_SPR_DIR, PROCESSED_IMAGES_DIR, {size: SPRITE_SIZE});
    log(`Original tibia.spr converted to png`)
  }

  log(`Loading tibia.dat`)
  const data = tibiaDatLoader.read(ORIGINAL_TIBIA_DAT_DIR);
  log(`Original tibia.dat loaded`)

  log(`Adding new items`)
  await addItems(data);
  tibiaDatLoader.recalculate(data);
  log(`Added new items to tibia.dat`)
  
  log(`Adding new outfits`)
  await addOutfits(data);
  tibiaDatLoader.recalculate(data);
  log(`Added new outfits to tibia.dat`)
  
  tibiaDatLoader.write(`${BINARIES_PUBLISH_DIR}\\Tibia.dat`, data);
  log(`Compiled Tibia.dat file`)

  tibiaCwmPacker.compress(PROCESSED_IMAGES_DIR, `${BINARIES_PUBLISH_DIR}\\Tibia.cwm`);
  log(`Compiled Tibia.cwm file`)

  log(`Done`);
  
})();