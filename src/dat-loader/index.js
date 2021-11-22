const ITEM_PROPERTIES = require('./item-properties');
const fileReader = require("../commons/file-utils");

const readHeaders = () => {
    const signature = fileReader.readNumber(4);
    const items = fileReader.readNumber(2);
    const creatures = fileReader.readNumber(2);
    const effects = fileReader.readNumber(2);
    const distants = fileReader.readNumber(2);
    return { signature, items, creatures, effects, distants };
}

const writeHeaders = (headers) => {
    const { signature, items, creatures, effects, distants } = headers;
    fileReader.writeNumber(signature, 4);
    fileReader.writeNumber(items, 2);
    fileReader.writeNumber(creatures, 2);
    fileReader.writeNumber(effects, 2);
    fileReader.writeNumber(distants, 2);
}

const getItemTypeProperties = (id, {items, creatures, effects}) => {
    let type, typeId;
    if (id > items + creatures + effects) {
        type = "distants";
        typeId = id - items - creatures - effects;
    } else if (id > items + creatures) {
        type = "effect";
        typeId = id - items - creatures;
    } else if (id > items) {
        type = "creature";
        typeId = id - items;
    } else {
        type = "item";
        typeId = id;
    }
    return { id, type, typeId };
}

const readItems = (headers) => {
    let itemId = 100;
    const items = [];
    let properties = [];

    while(fileReader.hasMore()) {
        const propertyId = fileReader.readNumber();
        const { name, reader } = ITEM_PROPERTIES.find(({id}) => id === propertyId);
        const data = reader ? reader(fileReader) : undefined;
        if (propertyId === 255) { // magic number
            const { id, type, typeId } = getItemTypeProperties(itemId++, headers);
            items.push({...data, properties, id, type, typeId});
            properties = [];
        } else {
            properties.push({name, data});
        }
    }

    return items;
}

const writeItemProperty = (itemProperty) => {
    const { id, data } = itemProperty;
    fileReader.writeNumber(id);
    if (data && data.length > 0) {
        fileReader.writeByteNumbers(data);
    }
};

const writeItems = (items) => {
    for (const item of items) {
        for (let id=0; id<256; id++) {
            const prop = ITEM_PROPERTIES.find(p => p.id === id);
            if (prop) {
                const { name } = prop;
                if (id === 255) { // magic number
                    fileReader.writeNumber(id);
                    prop.writer(fileReader, item);
                } else {
                    const itemProperty = item.properties.find(p => p.name === name);
                    if (itemProperty) {
                        writeItemProperty(fileReader, {id, ...itemProperty});
                    }
                }
            }
        }
    }
}

const read = (directory) => {
    fileReader.open(directory);
    const headers = readHeaders();
    const items = readItems(headers);
    fileReader.close();
    return { headers, items };
}

const write = (directory, data) => {
    const { headers, items } = data;
    fileReader.open(directory, 'w');
    writeHeaders(headers);
    writeItems(items);
    fileReader.close();

}

module.exports = { read, write };