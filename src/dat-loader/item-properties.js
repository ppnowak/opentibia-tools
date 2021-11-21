const spritesReader = (reader) => {
    const width = reader.readNumber();
    const height = reader.readNumber();
    let skip = 0;
    if (width>1 || height>1) {
        skip = reader.readNumber();
    }
    const blend = reader.readNumber();
    const xdiv = reader.readNumber();
    const ydiv = reader.readNumber();
    const unkn = reader.readNumber();
    const anim = reader.readNumber();
    const sprNum = width * height * blend * xdiv * ydiv * unkn * anim;
    const sprites = [];
    for (let i=0; i<sprNum; i++) {
        sprites.push(reader.readNumber(2));
    }
    return { width, height, skip, blend, xdiv, ydiv, unkn, anim, sprites}
}

const spritesWriter = (reader, item) => {
    const { width, height, skip, blend, xdiv, ydiv, unkn, anim, sprites} = item;
    reader.writeNumber(width);
    reader.writeNumber(height);
    if (width>1 || height>1) {
        reader.writeNumber(skip);
    }
    reader.writeNumber(blend);
    reader.writeNumber(xdiv);
    reader.writeNumber(ydiv);
    reader.writeNumber(unkn);
    reader.writeNumber(anim);
    for (const sprite of sprites) {
        reader.writeNumber(sprite, 2);
    }
}

const twoByteReader = (r) => r.readByteNumbers(2);
const fourByteReader = (r) => r.readByteNumbers(4);

const PROPERTIES = [
    { id: 0,   name: 'GROUND', reader: twoByteReader },
    { id: 1,   name: 'TOP_ITEM_1' },
    { id: 2,   name: 'CAN_WALK_THROUGH' },
    { id: 3,   name: 'TOP_ITEM_3' },
    { id: 4,   name: 'CONTAINER' },
    { id: 5,   name: 'COUNTABLE' },
    { id: 6,   name: 'LADDER' },
    { id: 7,   name: 'USEABLE' },
    { id: 8,   name: 'WRITEABLE', reader: twoByteReader },
    { id: 9,   name: 'WRITEABLE_ED', reader: twoByteReader },
    { id: 10,  name: 'FLUID' },
    { id: 11,  name: 'MULTI_TYPE' },
    { id: 12,  name: 'BLOCKING' },
    { id: 13,  name: 'NOT_MOVEABLE' },
    { id: 14,  name: 'BLOCK_MISSILES' },
    { id: 15,  name: 'BLOCK_PATH_FIND' },
    { id: 16,  name: 'TAKEABLE' },
    { id: 17,  name: 'WALL' },
    { id: 18,  name: 'HORIZONTAL' },
    { id: 19,  name: 'VERTICAL' },
    { id: 20,  name: 'ROTATEABLE' },
    { id: 21,  name: 'LIGHT', reader: fourByteReader },
    { id: 22,  name: 'UNKNOWN' },
    { id: 23,  name: 'HOLE' },
    { id: 24,  name: 'PLAYER_COLOR_TEMPLATE', reader: fourByteReader },
    { id: 25,  name: 'HEIGHT', reader: twoByteReader },
    { id: 26,  name: 'DRAW_WITH_HEIGHT_OFFSET' },
    { id: 27,  name: 'IDLE_ANIMATED' },
    { id: 28,  name: 'MINIMAP', reader: twoByteReader },
    { id: 29,  name: 'ACTION_ID', reader: twoByteReader },
    { id: 30,  name: 'NOT_FLOOR_CHANGE' },
    { id: 255, name: 'SPRITES', reader: spritesReader, writer: spritesWriter }
]

module.exports = PROPERTIES;