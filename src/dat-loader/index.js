const ITEM_PROPERTIES = require('./item-properties');
const fileReader = require("../commons/file-utils");
const fs = require('fs');

const readHeaders = () => {
    const signature = fileReader.readNumber(4);
    const items = fileReader.readNumber(2);
    const creatures = fileReader.readNumber(2);
    const effects = fileReader.readNumber(2);
    const distants = fileReader.readNumber(2);
    return { signature, items, creatures, effects, distants };
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

    while(fileReader.hasMore()) {
        const propertyId = fileReader.readNumber();
        const { name, reader } = ITEM_PROPERTIES.find(({id}) => id === propertyId);
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

const writeObjects = ({items, creatures, distants, effects}) => {   
    const objects = [ ...items, ...creatures, ...effects, ...distants ];
    for (const object of objects) {
        for (let id=0; id<256; id++) {
            const prop = ITEM_PROPERTIES.find(p => p.id === id);
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

const unpackToJSON = (datFile, file) => {
    const data = read(datFile);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const unpackToDirectory = (datFile, directory) => {
    const data = read(datFile);
    fileReader.createDir(`${directory}`);
    fs.writeFileSync(`${directory}/headers.json`, JSON.stringify(data.headers, null, 2));
    for (const category of Object.keys(data)) {
        fileReader.createDir(`${directory}/${category}`);
        if (category !== 'headers') {
            for (const item of data[category]) {
                fs.writeFileSync(`${directory}/${category}/${item.typeId}.json`, JSON.stringify(item, null, 2));
            }
        }
    }
}

const write = (directory, data) => {
    const { headers, items, creatures, distants, effects } = recalculate(data);
    fileReader.open(directory, 'w');
    writeHeaders(headers, { items, creatures, distants, effects });
    writeObjects({items, creatures, distants, effects});
    fileReader.close();

}

module.exports = { read, write, recalculate, unpackToJSON, unpackToDirectory };