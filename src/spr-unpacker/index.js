const fileReader = require("../commons/file-utils");
const imageUtils = require("../commons/image-utils");

const readHeaders = () => {
    const hdra = fileReader.readNumber(2);
    const hdrb = fileReader.readNumber(2);
    const spritesQuantity = fileReader.readNumber(2);
    return {hdra, hdrb, spritesQuantity};
}

const readSprite = (position) => {
    fileReader.setPosition(position);
    let wsk=0, transp=0, pixels=0;

    const rt = fileReader.readNumber();
    const gt = fileReader.readNumber();
    const bt = fileReader.readNumber();
    const wskMax = fileReader.readNumber(2);

    const imagePixels = [];
    for (let y=0;y<32;y++) {
        imagePixels[y] = [];
        for (let x=0;x<32;x++) {
            const pixel = [255, 0, 255, 255];
            if (transp === 0 && pixels === 0) {
                transp = fileReader.readNumber(2);
                pixels = fileReader.readNumber(2);
                wsk += 4;
            }

            if (transp > 0) {
                transp--;
            } else if (transp === 0 && wsk < wskMax) {
                if (pixels > 0) {
                    pixel[0] = fileReader.readNumber();
                    pixel[1] = fileReader.readNumber();
                    pixel[2] = fileReader.readNumber();
                    wsk += 3;
                    pixels--;
                }
            }

            imagePixels[y][x] = pixel;
        }
    }
    return imagePixels;
}

const saveSprite = async (id, pixels, sprDirectory) => {
    const image = imageUtils.createFromPixels(pixels);
    await imageUtils.save(image, `${sprDirectory}/${id}.bmp`)
}

const extractSprites = async (sprDirectory, spritesQuantity) => {
    for (let id=1; id<spritesQuantity; id++) {
        const position = 2 + id * 4;
        fileReader.setPosition(position);
        const handler = fileReader.readNumber(4);
        if (handler !== 0) {
            const pixels = readSprite(handler);
            await saveSprite(id, pixels, sprDirectory);
        }

        if (id % 1000 === 0) {
            console.log(`Processed ${id}/${spritesQuantity}`)
        }
    }
}

const extract = async (sprFile, sprDirectory) => {
    fileReader.open(sprFile);
    const { hdra, hdrb, spritesQuantity } = readHeaders();
    console.log({hdra, hdrb, spritesQuantity});
    fileReader.createDir(sprDirectory);
    await extractSprites(sprDirectory, spritesQuantity);   
    fileReader.close();
}

module.exports = { extract };