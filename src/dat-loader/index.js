const ITEM_PROPERTIES = require('./item-properties');
const { getPropertiesForVersion, getDefaultProperties } = require('./item-properties-versioned');
const { getVersionByDatSignature } = require('../commons/tibia-versions');
const fileReader = require("../commons/file-utils");

const readHeaders = () => {
    const signature = fileReader.readNumber(4);
    const items = fileReader.readNumber(2);
    const creatures = fileReader.readNumber(2);
    const effects = fileReader.readNumber(2);
    const distants = fileReader.readNumber(2);

    // Detect version from signature
    const versionInfo = getVersionByDatSignature(signature);
    const version = versionInfo ? versionInfo.version : 'unknown';

    console.log(`Detected Tibia version: ${version} (signature: 0x${signature.toString(16).toUpperCase()})`);

    return { signature, items, creatures, effects, distants, version, versionInfo };
}

const writeHeaders = ({ signature }, data) => {
    const { items, creatures, effects, distants } = data;
    fileReader.writeNumber(signature, 4);
    fileReader.writeNumber(99 + items.length, 2);
    fileReader.writeNumber(creatures.length, 2);
    fileReader.writeNumber(effects.length, 2);
    fileReader.writeNumber(distants.length, 2);
}

const getItemTypeProperties = (id, {items, creatures, effects}) => {
    let type, typeId;
    if (id > items + creatures + effects) {
        type = "distants";
        typeId = id - items - creatures - effects;
    } else if (id > items + creatures) {
        type = "effects";
        typeId = id - items - creatures;
    } else if (id > items) {
        type = "creatures";
        typeId = id - items;
    } else {
        type = "items";
        typeId = id;
    }
    return { id, type, typeId };
}

const readObjects = (headers) => {
    let itemId = 100;
    const results = {
        items: [],
        creatures: [],
        effects: [],
        distants: [],
    }
    let properties = [];

    // Get version-specific properties or fall back to default
    const versionedProperties = headers.version && headers.version !== 'unknown'
        ? getPropertiesForVersion(headers.version)
        : ITEM_PROPERTIES;

    while(fileReader.hasMore()) {
        const propertyId = fileReader.readNumber();
        const property = versionedProperties.find(({id}) => id === propertyId);

        if (!property) {
            console.warn(`Unknown property ID: 0x${propertyId.toString(16).toUpperCase()} at item ${itemId}`);
            // Skip this property and continue
            continue;
        }

        const { name, reader } = property;
        const data = reader ? reader(fileReader) : undefined;
        if (propertyId === 255) { // magic number
            const { id, type, typeId } = getItemTypeProperties(itemId++, headers);
            results[type].push({...data, properties, id, type, typeId});
            properties = [];
        } else {
            properties.push({name, data});
        }
    }
    return results;
}

const writeItemProperty = (itemProperty) => {
    const { id, data } = itemProperty;
    fileReader.writeNumber(id);
    if (data && data.length > 0) {
        fileReader.writeByteNumbers(data);
    }
};

const writeObjects = ({items, creatures, distants, effects}, headers) => {
    // Get version-specific properties or fall back to default
    const versionedProperties = headers && headers.version && headers.version !== 'unknown'
        ? getPropertiesForVersion(headers.version)
        : ITEM_PROPERTIES;

    const objects = [ ...items, ...creatures, ...distants, ...effects ];
    for (const object of objects) {
        for (let id=0; id<256; id++) {
            const prop = versionedProperties.find(p => p.id === id);
            if (prop) {
                const { name } = prop;
                if (id === 255) { // magic number
                    fileReader.writeNumber(id);
                    prop.writer(fileReader, object);
                } else {
                    const itemProperty = object.properties.find(p => p.name === name);
                    if (itemProperty) {
                        writeItemProperty({id, ...itemProperty});
                    }
                }
            }
        }
    }
}

const recalculate = (data) => {
    let id = 100;
    for (const type of [data.items, data.creatures, data.effects, data.distants]) {
      let typeId = 1;
      for (const obj of type) {
        obj.id = id++;
        obj.typeId = typeId++;
      }
    }
    return data;
  }

const read = (directory) => {
    fileReader.open(directory);
    const headers = readHeaders();
    const objects = readObjects(headers);
    fileReader.close();
    return { headers, ...objects };
}

const write = (directory, data) => {
    const { headers, items, creatures, distants, effects } = recalculate(data);
    fileReader.open(directory, 'w');
    writeHeaders(headers, { items, creatures, distants, effects });
    writeObjects({items, creatures, distants, effects}, headers);
    fileReader.close();

}

module.exports = { read, write, recalculate };