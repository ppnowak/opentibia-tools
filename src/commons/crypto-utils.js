var crypto = require('crypto');
const { getFilesFromDir } = require('./file-utils');
const fs = require('fs');
const asyncQueue = require("./async-queue");

const calculateChecksum = (str, algorithm, encoding) => {
  return crypto
    .createHash(algorithm || 'md5')
    .update(str, 'utf8')
    .digest(encoding || 'hex')
}

const calculateFileChecksum = (file) => calculateChecksum(fs.readFileSync(file));

const calculateDirectoryFilesChecksum = async (directory) => {
  const files = getFilesFromDir(directory);
  const queue = asyncQueue.createQueue();
  const checksums = [];
  for (const file of files) {
      const job = async () => checksums.push({ file, checksum: calculateFileChecksum(`${directory}${file}`) });
      asyncQueue.addTask(queue, job);
      await asyncQueue.waitIf(queue, { length: 1000 });
  }
  await asyncQueue.waitForEnd(queue);
  return checksums;
}

module.exports = { calculateChecksum, calculateFileChecksum, calculateDirectoryFilesChecksum };