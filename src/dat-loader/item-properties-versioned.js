/**
 * Version-specific item property definitions for Tibia DAT files
 *
 * Different Tibia client versions have different property sets.
 * This file provides version-aware property definitions.
 */

const twoByteReader = (r) => r.readByteNumbers(2);
const fourByteReader = (r) => r.readByteNumbers(4);

// Property definitions common to most versions 7.x - 10.x
const COMMON_PROPERTIES = {
    GROUND: { id: 0x00, name: 'GROUND', reader: twoByteReader },
    TOP_ITEM_1: { id: 0x01, name: 'TOP_ITEM_1' },
    CAN_WALK_THROUGH: { id: 0x02, name: 'CAN_WALK_THROUGH' },
    TOP_ITEM_3: { id: 0x03, name: 'TOP_ITEM_3' },
    CONTAINER: { id: 0x04, name: 'CONTAINER' },
    STACKABLE: { id: 0x05, name: 'STACKABLE' },
    LADDER: { id: 0x06, name: 'LADDER' },
    USEABLE: { id: 0x07, name: 'USEABLE' },
    WRITEABLE: { id: 0x08, name: 'WRITEABLE', reader: twoByteReader },
    WRITEABLE_ED: { id: 0x09, name: 'WRITEABLE_ED', reader: twoByteReader },
    FLUID: { id: 0x0A, name: 'FLUID' },
    MULTI_TYPE: { id: 0x0B, name: 'MULTI_TYPE' },
    BLOCKING: { id: 0x0C, name: 'BLOCKING' },
    NOT_MOVEABLE: { id: 0x0D, name: 'NOT_MOVEABLE' },
    BLOCK_MISSILES: { id: 0x0E, name: 'BLOCK_MISSILES' },
    BLOCK_PATH_FIND: { id: 0x0F, name: 'BLOCK_PATH_FIND' },
    TAKEABLE: { id: 0x10, name: 'TAKEABLE' },
    WALL: { id: 0x11, name: 'WALL' },
    HORIZONTAL: { id: 0x12, name: 'HORIZONTAL' },
    VERTICAL: { id: 0x13, name: 'VERTICAL' },
    ROTATEABLE: { id: 0x14, name: 'ROTATEABLE' },
    LIGHT: { id: 0x15, name: 'LIGHT', reader: fourByteReader },
    UNKNOWN: { id: 0x16, name: 'UNKNOWN' },
    HOLE: { id: 0x17, name: 'HOLE' },
};

// Additional properties for version 7.80+
const PROPERTIES_7_80 = {
    ...COMMON_PROPERTIES,
    PLAYER_COLOR_TEMPLATE: { id: 0x18, name: 'PLAYER_COLOR_TEMPLATE', reader: fourByteReader },
    HEIGHT: { id: 0x19, name: 'HEIGHT', reader: twoByteReader },
    DRAW_WITH_HEIGHT_OFFSET: { id: 0x1A, name: 'DRAW_WITH_HEIGHT_OFFSET' },
    IDLE_ANIMATED: { id: 0x1B, name: 'IDLE_ANIMATED' },
    MINIMAP: { id: 0x1C, name: 'MINIMAP', reader: twoByteReader },
    ACTION_ID: { id: 0x1D, name: 'ACTION_ID', reader: twoByteReader },
    NOT_FLOOR_CHANGE: { id: 0x1E, name: 'NOT_FLOOR_CHANGE' },
};

// Properties for version 8.60+ (some property IDs were reorganized)
const PROPERTIES_8_60 = {
    GROUND: { id: 0x00, name: 'GROUND', reader: twoByteReader },
    TOP_ITEM_1: { id: 0x01, name: 'TOP_ITEM_1' },
    TOP_ITEM_2: { id: 0x02, name: 'TOP_ITEM_2' },
    TOP_ITEM_3: { id: 0x03, name: 'TOP_ITEM_3' },
    CONTAINER: { id: 0x04, name: 'CONTAINER' },
    STACKABLE: { id: 0x05, name: 'STACKABLE' },
    FORCE_USE: { id: 0x06, name: 'FORCE_USE' },
    MULTI_USE: { id: 0x07, name: 'MULTI_USE' },
    WRITEABLE: { id: 0x08, name: 'WRITEABLE', reader: twoByteReader },
    WRITEABLE_ONCE: { id: 0x09, name: 'WRITEABLE_ONCE', reader: twoByteReader },
    FLUID_CONTAINER: { id: 0x0A, name: 'FLUID_CONTAINER' },
    SPLASH: { id: 0x0B, name: 'SPLASH' },
    BLOCKING: { id: 0x0C, name: 'BLOCKING' },
    NOT_MOVEABLE: { id: 0x0D, name: 'NOT_MOVEABLE' },
    BLOCK_MISSILES: { id: 0x0E, name: 'BLOCK_MISSILES' },
    BLOCK_PATH_FIND: { id: 0x0F, name: 'BLOCK_PATH_FIND' },
    PICKUPABLE: { id: 0x10, name: 'PICKUPABLE' },
    HANGABLE: { id: 0x11, name: 'HANGABLE' },
    HORIZONTAL: { id: 0x12, name: 'HORIZONTAL' },
    VERTICAL: { id: 0x13, name: 'VERTICAL' },
    ROTATABLE: { id: 0x14, name: 'ROTATABLE' },
    LIGHT: { id: 0x15, name: 'LIGHT', reader: fourByteReader },
    DONT_HIDE: { id: 0x16, name: 'DONT_HIDE' },
    TRANSLUCENT: { id: 0x17, name: 'TRANSLUCENT' },
    OFFSET: { id: 0x18, name: 'OFFSET', reader: twoByteReader },
    ELEVATION: { id: 0x19, name: 'ELEVATION', reader: twoByteReader },
    LYING_OBJECT: { id: 0x1A, name: 'LYING_OBJECT' },
    ANIMATE_ALWAYS: { id: 0x1B, name: 'ANIMATE_ALWAYS' },
    MINIMAP_COLOR: { id: 0x1C, name: 'MINIMAP_COLOR', reader: twoByteReader },
    LENS_HELP: { id: 0x1D, name: 'LENS_HELP', reader: twoByteReader },
    FULL_GROUND: { id: 0x1E, name: 'FULL_GROUND' },
    IGNORE_LOOK: { id: 0x1F, name: 'IGNORE_LOOK' },
    CLOTH: { id: 0x20, name: 'CLOTH', reader: twoByteReader },
    MARKET: { id: 0x21, name: 'MARKET', reader: (r) => {
        const category = r.readNumber(2);
        const tradeAs = r.readNumber(2);
        const showAs = r.readNumber(2);
        const nameLen = r.readNumber(2);
        const name = r.readText(nameLen);
        const restrictVocation = r.readNumber(2);
        const restrictLevel = r.readNumber(2);
        return { category, tradeAs, showAs, name, restrictVocation, restrictLevel };
    }},
};

// Properties for version 10.10+ (additional properties)
const PROPERTIES_10_10 = {
    ...PROPERTIES_8_60,
    DEFAULT_ACTION: { id: 0x22, name: 'DEFAULT_ACTION', reader: twoByteReader },
    WRAPPABLE: { id: 0x23, name: 'WRAPPABLE' },
    UNWRAPPABLE: { id: 0x24, name: 'UNWRAPPABLE' },
    TOP_EFFECT: { id: 0x25, name: 'TOP_EFFECT' },
};

// Sprites property reader (common to all versions, always property ID 0xFF/255)
const spritesReader = (reader) => {
    const width = reader.readNumber();
    const height = reader.readNumber();
    let skip = 0;
    if (width > 1 || height > 1) {
        skip = reader.readNumber();
    }
    const blend = reader.readNumber();
    const xdiv = reader.readNumber();
    const ydiv = reader.readNumber();
    const unkn = reader.readNumber();
    const anim = reader.readNumber();
    const sprNum = width * height * blend * xdiv * ydiv * unkn * anim;
    const sprites = [];
    for (let i = 0; i < sprNum; i++) {
        sprites.push(reader.readNumber(2));
    }
    return { width, height, skip, blend, xdiv, ydiv, unkn, anim, sprites };
};

const spritesWriter = (reader, item) => {
    const { width, height, skip, blend, xdiv, ydiv, unkn, anim, sprites } = item;
    reader.writeNumber(width);
    reader.writeNumber(height);
    if (width > 1 || height > 1) {
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
};

/**
 * Get property definitions for a specific Tibia version
 * @param {string} version - The version string (e.g., "10.98")
 * @returns {Array} - Array of property definitions
 */
const getPropertiesForVersion = (version) => {
    const [major, minor] = version.split('.').map(Number);

    let properties;

    // Determine which property set to use based on version
    if (major < 7 || (major === 7 && minor < 80)) {
        // Very old versions (< 7.80)
        properties = COMMON_PROPERTIES;
    } else if (major < 8 || (major === 8 && minor < 60)) {
        // Version 7.80 - 8.59
        properties = PROPERTIES_7_80;
    } else if (major < 10 || (major === 10 && minor < 10)) {
        // Version 8.60 - 10.09
        properties = PROPERTIES_8_60;
    } else {
        // Version 10.10+
        properties = PROPERTIES_10_10;
    }

    // Convert properties object to array and add sprites property
    const propsArray = Object.values(properties).map(prop => ({
        id: prop.id,
        name: prop.name,
        reader: prop.reader,
    }));

    // Add sprites property (always 0xFF/255)
    propsArray.push({
        id: 0xFF,
        name: 'SPRITES',
        reader: spritesReader,
        writer: spritesWriter,
    });

    return propsArray;
};

/**
 * Get default properties (for backwards compatibility)
 * Uses the same property set as the original implementation (version 8.60-like)
 */
const getDefaultProperties = () => {
    // Return original property set for backwards compatibility
    return [
        { id: 0, name: 'GROUND', reader: twoByteReader },
        { id: 1, name: 'TOP_ITEM_1' },
        { id: 2, name: 'CAN_WALK_THROUGH' },
        { id: 3, name: 'TOP_ITEM_3' },
        { id: 4, name: 'CONTAINER' },
        { id: 5, name: 'COUNTABLE' },
        { id: 6, name: 'LADDER' },
        { id: 7, name: 'USEABLE' },
        { id: 8, name: 'WRITEABLE', reader: twoByteReader },
        { id: 9, name: 'WRITEABLE_ED', reader: twoByteReader },
        { id: 10, name: 'FLUID' },
        { id: 11, name: 'MULTI_TYPE' },
        { id: 12, name: 'BLOCKING' },
        { id: 13, name: 'NOT_MOVEABLE' },
        { id: 14, name: 'BLOCK_MISSILES' },
        { id: 15, name: 'BLOCK_PATH_FIND' },
        { id: 16, name: 'TAKEABLE' },
        { id: 17, name: 'WALL' },
        { id: 18, name: 'HORIZONTAL' },
        { id: 19, name: 'VERTICAL' },
        { id: 20, name: 'ROTATEABLE' },
        { id: 21, name: 'LIGHT', reader: fourByteReader },
        { id: 22, name: 'UNKNOWN' },
        { id: 23, name: 'HOLE' },
        { id: 24, name: 'PLAYER_COLOR_TEMPLATE', reader: fourByteReader },
        { id: 25, name: 'HEIGHT', reader: twoByteReader },
        { id: 26, name: 'DRAW_WITH_HEIGHT_OFFSET' },
        { id: 27, name: 'IDLE_ANIMATED' },
        { id: 28, name: 'MINIMAP', reader: twoByteReader },
        { id: 29, name: 'ACTION_ID', reader: twoByteReader },
        { id: 30, name: 'NOT_FLOOR_CHANGE' },
        { id: 255, name: 'SPRITES', reader: spritesReader, writer: spritesWriter },
    ];
};

module.exports = {
    getPropertiesForVersion,
    getDefaultProperties,
    PROPERTIES_7_80,
    PROPERTIES_8_60,
    PROPERTIES_10_10,
};
