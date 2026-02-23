const fs = require("node:fs");
const { getAddress } = require("ethers");

/**
 * Loads and parses a JSON file safely.
 */
function loadJsonFile(filePath) {
	if (!fs.existsSync(filePath)) {
		throw Error(`File not found: ${filePath}`);
	}
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch (error) {
		throw Error(`Failed to parse ${filePath}: ${error.message}`);
	}
}

/**
 * Saves an object to a JSON file.
 */
function saveJsonFile(filePath, data) {
	const content = `${JSON.stringify(data, null, 2)}
`;
	fs.writeFileSync(filePath, content);
}

/**
 * Normalizes an Ethereum address.
 */
function fixAddress(address) {
	try {
		return getAddress(address);
	} catch (error) {
		throw Error(`Invalid Ethereum address: ${address}`);
	}
}

/**
 * Validates a slug format.
 */
function validSlug(slug) {
	return /^[a-z0-9-]+$/.test(slug);
}

/**
 * Validates a URL using the built-in URL constructor.
 */
function validUrl(url) {
	try {
		const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
		return !!parsed.hostname;
	} catch {
		return false;
	}
}

/**
 * Ensures the input is an array.
 */
function getArray(v) {
	if (v === undefined || v === null) return [];
	return Array.isArray(v) ? v : [v];
}

module.exports = {
	loadJsonFile,
	saveJsonFile,
	fixAddress,
	validSlug,
	validUrl,
	getArray,
};
