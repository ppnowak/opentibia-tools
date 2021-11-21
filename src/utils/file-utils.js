const fs = require('fs');
const { bufferToNumber, numberToBuffer } = require('./utils.js');

let CURRENT_POSITION = -1;
let BUFFER_SIZE = -1;

const open = (dir, mode = 'r') => {
    if (mode === 'r') {
        BUFFER_SIZE = Buffer.byteLength(fs.readFileSync(dir))
    }
    FILE_HANDLE = fs.openSync(dir, mode);
    CURRENT_POSITION = 0;
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

const writeNumber = (number, length = 1) => writeBytes(numberToBuffer(number, length));

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

module.exports = { open, readNumber, writeNumber, readByteNumbers, writeByteNumbers, hasMore, close, setPosition };