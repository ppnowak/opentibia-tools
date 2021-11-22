const fileReader = require("../commons/file-utils");
const fs = require("fs");
const { log } = require("../commons/utils");

const readHeaders = () => {
    const version = fileReader.readNumber(1);
    if (version !== 1) {
        throw new Error("Incorrect CWM file version");
    };
    const size = fileReader.readNumber(2);
    const spritesQuantity = fileReader.readNumber(4);
    return { version, size, spritesQuantity };
}

const writeHeaders = data => {
    const { version = 1, size = 64, spritesQuantity } = data || {};
    fileReader.writeNumber(version, 1);
    fileReader.writeNumber(size, 2);
    fileReader.writeNumber(spritesQuantity, 4);
}

const readFileHeaders = (spritesQuantity) => {
    const files = [];
    for (let i=0; i<spritesQuantity;i++) {
        const dataStart = fileReader.readNumber(4);
        const dataLength = fileReader.readNumber(4);
        const nameLength = fileReader.readNumber(2);
        const name = fileReader.readText(nameLength);
        const data = {name, dataStart, dataLength };
        files.push(data);
    }
    return files;
}

const writeFileHeaders = (files) => {
    let dataStart = 7 + files.map(({name}) => {
        const headerLength = 4 + 4 + 2 + name.length;
        return headerLength;
    }).reduce((previous, current) => previous + current, 0);
    for (const { name, data} of files) {
        fileReader.writeNumber(dataStart, 4);
        fileReader.writeNumber(data.length, 4);
        fileReader.writeNumber(name.length, 2);
        fileReader.writeText(name);
        dataStart += data.length;
    }
}

const writeFiles = (files) => {
    writeFileHeaders(files);
    for (const { data } of files) {
        fileReader.writeBytes(data);
    }
}

const saveFile = (directory, data) => fs.writeFileSync(directory, data);

const extract = (cwmFile, pngDirectory) => {
    fileReader.createDir(pngDirectory);

    fileReader.open(cwmFile);
    const { spritesQuantity } = readHeaders();
    const files = readFileHeaders(spritesQuantity);    
    log(`Found ${files.length} sprites, extracting...`);

    for (const file of files) {
        const data = fileReader.readBytes(file.dataLength);
        saveFile(`${pngDirectory}/${file.name}`, data);
    }
    fileReader.close();

}

const compress = (pngDirectory, cwmFile) => {
    fileReader.open(cwmFile, 'w');
    const files = [];
    for (const name of fileReader.getFilesFromDir(pngDirectory)) {
        const data = fs.readFileSync(`${pngDirectory}/${name}`)
        files.push({ name, data });
    }
    writeHeaders({ spritesQuantity: files.length });
    writeFiles(files);
    fileReader.close();
}

module.exports = { extract, compress };