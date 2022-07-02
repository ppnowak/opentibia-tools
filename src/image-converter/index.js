const fileUtils = require("../commons/file-utils");
const imageUtils = require("../commons/image-utils");
const asyncQueue = require("../commons/async-queue");
const { log } = require("../commons/utils");

const DEFAULTS = {
    colorFrom: [255, 0, 255, 255], // tibia pink
    colorTo: [0, 0, 0, 0], // transparent
    size: 32
}

const convertFile = async (source, destination, params) => {
    const { colorFrom, colorTo, size } = { ...DEFAULTS, ...(params || {})};
    const img = await imageUtils.readImage(source);
    if (colorFrom && colorTo) {
        imageUtils.overrideColor(img, colorFrom, colorTo);
    }
    imageUtils.resize(img, size);
    await imageUtils.save(img, destination);
}

const convertToPng = async (source, destination, params) => {
    fileUtils.createDir(destination);
    const files = fileUtils.getFilesFromDir(source);
    const queue = asyncQueue.createQueue();
    log(`Found ${files.length} files`);
    for (const file of files) {
        const [ id ] = file.split(".");
        const sourceFile = `${source}/${file}`;
        const destinationFile = `${destination}/${id}.png`;
        const job = async () => await convertFile(sourceFile, destinationFile, params);
        asyncQueue.addTask(queue, job);
    }
    await asyncQueue.waitForEnd(queue);
}

module.exports = { convertToPng, convertFile };