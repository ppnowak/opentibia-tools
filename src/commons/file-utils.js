const fs = require('fs');
const { bufferToNumber, numberToBuffer } = require('./utils.js');

let CURRENT_POSITION = -1;
let BUFFER_SIZE = -1;

const createDir = (dir) => {
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
}

const getFilesFromDir = (dir) => fs.readdirSync(dir, (err, files) => files);

const open = (dir, mode = 'r') => {
    if (mode === 'r') {
        BUFFER_SIZE = Buffer.byteLength(fs.readFileSync(dir))
    }
    FILE_HANDLE = fs.openSync(dir, mode);
    CURRENT_POSITION = 0;
}

const getCursor = () => CURRENT_POSITION;

const debug = () => {
    console.log({
        current: CURRENT_POSITION,
        size: BUFFER_SIZE
    })
}

const close = () => fs.closeSync(FILE_HANDLE);

const setPosition = (pos) => CURRENT_POSITION = pos;

const hasMore = () => CURRENT_POSITION < BUFFER_SIZE;

const readBytes = (length) => {
    const buffer = Buffer.alloc(length);
    fs.readSync(FILE_HANDLE, buffer, 0, length, CURRENT_POSITION, function(err, num) {});
    CURRENT_POSITION += length;
    return buffer;
}

const writeBytes = (buffer) => {
    const length = buffer.length;
    fs.writeSync(FILE_HANDLE, buffer, 0, length, CURRENT_POSITION);
    CURRENT_POSITION += length;
}

const readNumber = (length = 1) => bufferToNumber(readBytes(length));

const readText = (length = 1) => readByteNumbers(length).map(chr => String.fromCharCode(chr)).join('');

const writeNumber = (number, length = 1) => writeBytes(numberToBuffer(number, length));

const writeText = text => {
    const numbers = text.split('').map(s => s.codePointAt());
    writeBytes(Buffer.from(numbers));
}

const readByteNumbers = quantity => {
    const res = [];
    for (let i=0; i<quantity; i++) {
        res.push(readNumber());
    }
    return res;
}

const writeByteNumbers = array => {
    for (const item of array) {
        writeNumber(item);
    }
}

module.exports = { debug, getCursor, createDir, getFilesFromDir, open, readBytes, readNumber, readText, writeBytes, writeNumber, writeText, readByteNumbers, writeByteNumbers, hasMore, close, setPosition };