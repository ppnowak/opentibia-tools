/**
 * Tibia Client Versions and Signatures
 *
 * This file contains mappings between Tibia client versions and their
 * corresponding DAT and SPR file signatures for version detection.
 */

const TIBIA_VERSIONS = [
    { version: '7.10', datSignature: 0x2A4BFF3D, sprSignature: 0xEB4AFF3D, otb: 0 },
    { version: '7.30', datSignature: 0x33621A41, sprSignature: 0x79621A41, otb: 0 },
    { version: '7.40', datSignature: 0x9C61BF41, sprSignature: 0x86EAB941, otb: 1 },
    { version: '7.50', datSignature: 0x7319F842, sprSignature: 0x4919F842, otb: 1 },
    { version: '7.55', datSignature: 0x8F2B7B43, sprSignature: 0xDE9C4F43, otb: 2 },
    { version: '7.60', datSignature: 0x335A9D43, sprSignature: 0xBE529843, otb: 3 },
    { version: '7.70', datSignature: 0x335A9D43, sprSignature: 0xBE529843, otb: 3 },
    { version: '7.80', datSignature: 0x4347CE44, sprSignature: 0x0642CE44, otb: 4 },
    { version: '7.90', datSignature: 0x4E857D45, sprSignature: 0xC8577945, otb: 5 },
    { version: '8.00', datSignature: 0xE6D77F46, sprSignature: 0x749E7F46, otb: 7 },
    { version: '8.10', datSignature: 0x47375D47, sprSignature: 0x010B5D47, otb: 8 },
    { version: '8.20', datSignature: 0xAA056948, sprSignature: 0xC9EC6848, otb: 10 },
    { version: '8.40', datSignature: 0x7A603D49, sprSignature: 0x7C4E3D49, otb: 12 },
    { version: '8.50', datSignature: 0xEBC5494A, sprSignature: 0x4EFD444A, otb: 15 },
    { version: '8.54', datSignature: 0x9EB8284B, sprSignature: 0x3494204B, otb: 17 },
    { version: '8.60', datSignature: 0x21B7284C, sprSignature: 0x9405224C, otb: 19 },
    { version: '8.62', datSignature: 0x5034974C, sprSignature: 0xC0B1854C, otb: 21 },
    { version: '8.70', datSignature: 0xC522FE4C, sprSignature: 0x8A07FD4C, otb: 23 },
    { version: '8.71', datSignature: 0x9E97414D, sprSignature: 0xBB4B3E4D, otb: 24 },
    { version: '9.00', datSignature: 0x0BA2BA4D, sprSignature: 0x321AAD4D, otb: 27 },
    { version: '9.10', datSignature: 0xFFDA124E, sprSignature: 0x27DB124E, otb: 28 },
    { version: '9.20', datSignature: 0x087C804E, sprSignature: 0x027C804E, otb: 29 },
    { version: '9.31', datSignature: 0x087C804E, sprSignature: 0x027C804E, otb: 29 },
    { version: '9.40', datSignature: 0xE51DE74E, sprSignature: 0x061EE74E, otb: 30 },
    { version: '9.44', datSignature: 0xBBEF0E4F, sprSignature: 0xEFEF0E4F, otb: 31 },
    { version: '9.50', datSignature: 0xABB7754F, sprSignature: 0xCDB7754F, otb: 36 },
    { version: '9.60', datSignature: 0xCC74FA4F, sprSignature: 0xF974FA4F, otb: 40 },
    { version: '9.70', datSignature: 0x6E3F1650, sprSignature: 0xFC3F1650, otb: 43 },
    { version: '9.80', datSignature: 0x7406C750, sprSignature: 0x5307C750, otb: 44 },
    { version: '9.81', datSignature: 0xC9E5D050, sprSignature: 0xB0E3D050, otb: 45 },
    { version: '9.82', datSignature: 0xD4A5DE50, sprSignature: 0x0CA5DE50, otb: 46 },
    { version: '9.83', datSignature: 0xC0F5F350, sprSignature: 0x88F1F350, otb: 47 },
    { version: '9.86', datSignature: 0x54AD3051, sprSignature: 0xBBAF3051, otb: 48 },
    { version: '10.00', datSignature: 0x45488F51, sprSignature: 0xE0488F51, otb: 49 },
    { version: '10.10', datSignature: 0xC3F8E351, sprSignature: 0xE9F8E351, otb: 50 },
    { version: '10.20', datSignature: 0x29F13652, sprSignature: 0x4FF13652, otb: 51 },
    { version: '10.30', datSignature: 0x3690A552, sprSignature: 0x5F90A552, otb: 53 },
    { version: '10.35', datSignature: 0x426EB352, sprSignature: 0x666EB352, otb: 54 },
    { version: '10.37', datSignature: 0xDF85C752, sprSignature: 0x0685C752, otb: 55 },
    { version: '10.39', datSignature: 0x839ADF52, sprSignature: 0xB19ADF52, otb: 56 },
    { version: '10.41', datSignature: 0xCDD4E552, sprSignature: 0xF0D4E552, otb: 57 },
    { version: '10.50', datSignature: 0x80761753, sprSignature: 0x9D761753, otb: 58 },
    { version: '10.51', datSignature: 0x70D82253, sprSignature: 0x96D82253, otb: 59 },
    { version: '10.52', datSignature: 0x29523453, sprSignature: 0x4B523453, otb: 60 },
    { version: '10.53', datSignature: 0xB8174553, sprSignature: 0xE3174553, otb: 61 },
    { version: '10.54', datSignature: 0x3F945653, sprSignature: 0x64945653, otb: 62 },
    { version: '10.55', datSignature: 0x27871254, sprSignature: 0x55871254, otb: 63 },
    { version: '10.56', datSignature: 0xF5392354, sprSignature: 0x19392354, otb: 64 },
    { version: '10.57', datSignature: 0xCF5D3454, sprSignature: 0x065D3454, otb: 65 },
    { version: '10.58', datSignature: 0xFC6D4754, sprSignature: 0x236E4754, otb: 66 },
    { version: '10.59', datSignature: 0x0CA45A54, sprSignature: 0x37A45A54, otb: 67 },
    { version: '10.60', datSignature: 0x61FD6C54, sprSignature: 0x8BFD6C54, otb: 68 },
    { version: '10.61', datSignature: 0x84378054, sprSignature: 0xB3378054, otb: 69 },
    { version: '10.62', datSignature: 0xB7829554, sprSignature: 0xE6829554, otb: 70 },
    { version: '10.63', datSignature: 0x1A11A554, sprSignature: 0x4211A554, otb: 71 },
    { version: '10.64', datSignature: 0xFED4B554, sprSignature: 0x29D5B554, otb: 72 },
    { version: '10.65', datSignature: 0x6D83C654, sprSignature: 0x9983C654, otb: 73 },
    { version: '10.70', datSignature: 0xDDDDE554, sprSignature: 0x03DEE554, otb: 74 },
    { version: '10.71', datSignature: 0xCF42F954, sprSignature: 0xFD42F954, otb: 75 },
    { version: '10.72', datSignature: 0x620A0555, sprSignature: 0x8E0A0555, otb: 76 },
    { version: '10.73', datSignature: 0x2B691555, sprSignature: 0x50691555, otb: 77 },
    { version: '10.74', datSignature: 0x80D42655, sprSignature: 0xAAD42655, otb: 78 },
    { version: '10.75', datSignature: 0x82203555, sprSignature: 0xAE203555, otb: 79 },
    { version: '10.76', datSignature: 0xDA784355, sprSignature: 0x00794355, otb: 80 },
    { version: '10.77', datSignature: 0xA7E85555, sprSignature: 0xCAE85555, otb: 81 },
    { version: '10.78', datSignature: 0x64426555, sprSignature: 0x88426555, otb: 82 },
    { version: '10.79', datSignature: 0x713A7155, sprSignature: 0x963A7155, otb: 83 },
    { version: '10.80', datSignature: 0xACA17F55, sprSignature: 0xCDA17F55, otb: 84 },
    { version: '10.81', datSignature: 0x9D098E55, sprSignature: 0xBF098E55, otb: 85 },
    { version: '10.82', datSignature: 0x1D3C0056, sprSignature: 0x42C80356, otb: 86 },
    { version: '10.90', datSignature: 0xCFA31456, sprSignature: 0xEAA31456, otb: 87 },
    { version: '10.91', datSignature: 0x9CE32856, sprSignature: 0xBAE32856, otb: 88 },
    { version: '10.92', datSignature: 0xF3FA3256, sprSignature: 0x15FA3256, otb: 89 },
    { version: '10.93', datSignature: 0x3E6F4656, sprSignature: 0x5A6F4656, otb: 90 },
    { version: '10.94', datSignature: 0x1B945156, sprSignature: 0x40945156, otb: 91 },
    { version: '10.95', datSignature: 0x24145F56, sprSignature: 0x47145F56, otb: 92 },
    { version: '10.96', datSignature: 0xFECE7156, sprSignature: 0x19CF7156, otb: 93 },
    { version: '10.97', datSignature: 0xAC278056, sprSignature: 0xC9278056, otb: 94 },
];

/**
 * Get version information by DAT signature
 * @param {number} signature - The DAT file signature (4-byte little-endian integer)
 * @returns {object|null} - Version information or null if not found
 */
const getVersionByDatSignature = (signature) => {
    return TIBIA_VERSIONS.find(v => v.datSignature === signature) || null;
};

/**
 * Get version information by SPR signature
 * @param {number} signature - The SPR file signature (4-byte little-endian integer)
 * @returns {object|null} - Version information or null if not found
 */
const getVersionBySprSignature = (signature) => {
    return TIBIA_VERSIONS.find(v => v.sprSignature === signature) || null;
};

/**
 * Get version information by version string
 * @param {string} version - The version string (e.g., "10.98")
 * @returns {object|null} - Version information or null if not found
 */
const getVersionByString = (version) => {
    return TIBIA_VERSIONS.find(v => v.version === version) || null;
};

/**
 * Check if a DAT signature is valid
 * @param {number} signature - The DAT file signature
 * @returns {boolean} - True if valid, false otherwise
 */
const isValidDatSignature = (signature) => {
    return TIBIA_VERSIONS.some(v => v.datSignature === signature);
};

/**
 * Check if a SPR signature is valid
 * @param {number} signature - The SPR file signature
 * @returns {boolean} - True if valid, false otherwise
 */
const isValidSprSignature = (signature) => {
    return TIBIA_VERSIONS.some(v => v.sprSignature === signature);
};

/**
 * Get the major version number from a version string
 * @param {string} version - The version string (e.g., "10.98")
 * @returns {number} - The major version number (e.g., 10)
 */
const getMajorVersion = (version) => {
    return parseInt(version.split('.')[0]);
};

/**
 * Get the minor version number from a version string
 * @param {string} version - The version string (e.g., "10.98")
 * @returns {number} - The minor version number (e.g., 98)
 */
const getMinorVersion = (version) => {
    const parts = version.split('.');
    return parts.length > 1 ? parseInt(parts[1]) : 0;
};

module.exports = {
    TIBIA_VERSIONS,
    getVersionByDatSignature,
    getVersionBySprSignature,
    getVersionByString,
    isValidDatSignature,
    isValidSprSignature,
    getMajorVersion,
    getMinorVersion,
};
