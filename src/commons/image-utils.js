const Jimp = require("jimp");

const readImage = async (dir) => await Jimp.read(dir);

const createFromPixels = (pixels) => {
    const image = new Jimp(pixels[0].length, pixels.length, '#000000ff');
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
        const [ red, blue, green, opacity ] = pixels[y][x];
        image.bitmap.data[idx] = red;
        image.bitmap.data[idx + 1] = blue;
        image.bitmap.data[idx + 2] = green;
        image.bitmap.data[idx + 3] = opacity;
    })
    return image;
}

const overrideColor = (image, from, to) => {
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
        const actual = [
            image.bitmap.data[idx],
            image.bitmap.data[idx + 1],
            image.bitmap.data[idx + 2],
            image.bitmap.data[idx + 3]
        ];
        if (actual[0] === from[0] && actual[1] === from[1] && actual[2] === from[2] && actual[3] === from[3]) {
            image.bitmap.data[idx] = to[0];
            image.bitmap.data[idx + 1] = to[1];
            image.bitmap.data[idx + 2] = to[2];
            image.bitmap.data[idx + 3] = to[3];
        }
    })
}

const resize = (image, size) => {
    if (image.bitmap.width !== image.bitmap.height) {
        throw new Error("Only square images resizing allowed");
    }
    if (image.bitmap.width !== size) {
        image.resize(size, size);
    }
}

const save = async (image, directory) => await new Promise((resolve, reject) => image.write(directory, (error, image) => {
        if (error) {
            reject(error);
        }
        resolve(image);
    }));

module.exports = { readImage, createFromPixels, overrideColor, resize, save };