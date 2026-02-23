const fs = require("node:fs");
const path = require("node:path");
const ethers = require("ethers");
const { loadJsonFile, validSlug, validUrl, getArray } = require("./utils");

// Global configuration for exceptions
const CONFIG = {
	duplicateAddressAllowed: ["gauntlet"],
};

const chainDirs = fs.readdirSync(".").filter((file) => /^\d+$/.test(file));
for (const dir of chainDirs) {
	validateChain(dir);
}

console.log("OK");

///////////

function validateChain(chainId) {
	const requiredFiles = [
		"entities.json",
		"vaults.json",
		"products.json",
		"points.json",
		"opportunities.json",
	];
	for (const file of requiredFiles) {
		if (!fs.existsSync(path.join(chainId, file))) {
			throw Error(`Chain ${chainId} is missing required file: ${file}`);
		}
	}

	const entities = loadJsonFile(`${chainId}/entities.json`);
	const vaults = loadJsonFile(`${chainId}/vaults.json`);
	const products = loadJsonFile(`${chainId}/products.json`);
	const points = loadJsonFile(`${chainId}/points.json`);
	const opportunities = loadJsonFile(`${chainId}/opportunities.json`);

	validateUniqueEntityAddresses(entities);

	for (const entityId of Object.keys(entities)) {
		const entity = entities[entityId];

		if (!validSlug(entityId))
			throw Error(`entities: invalid slug: ${entityId}`);
		if (!entity.name) throw Error(`entities: missing name for ${entityId}`);

		for (const addr of Object.keys(entity.addresses || {})) {
			if (addr !== ethers.getAddress(addr))
				throw Error(`entities: malformed address: ${addr} in ${entityId}`);
		}

		if (entity.logo && !validUrl(entity.logo)) {
			throw Error(
				`entities: logo is not a valid URL: ${entity.logo} in ${entityId}`,
			);
		}
	}

	for (const vaultId of Object.keys(vaults)) {
		const vault = vaults[vaultId];

		if (vaultId !== ethers.getAddress(vaultId))
			throw Error(`vaults: malformed vaultId: ${vaultId}`);
		if (!vault.name) throw Error(`vaults: missing name for ${vaultId}`);
		if (!vault.description)
			throw Error(`vaults: missing description for ${vaultId}`);

		for (const entity of getArray(vault.entity)) {
			if (!entities[entity])
				throw Error(`vaults: no such entity "${entity}" in vault ${vaultId}`);
		}
	}

	const activeVaults = new Set();
	const deprecatedVaults = new Set();

	for (const productId of Object.keys(products)) {
		const product = products[productId];

		if (!validSlug(productId))
			throw Error(`products: invalid slug: ${productId}`);
		if (!product.name) throw Error(`products: missing name for ${productId}`);

		for (const addr of product.vaults || []) {
			const normalized = ethers.getAddress(addr);
			if (addr !== normalized)
				throw Error(
					`products: malformed vault address: ${addr} in ${productId}`,
				);
			if (!vaults[addr])
				throw Error(`products: unknown vault: ${addr} in ${productId}`);

			if (activeVaults.has(addr))
				throw Error(`products: vault active in multiple products: ${addr}`);
			if (deprecatedVaults.has(addr))
				throw Error(
					`products: vault ${addr} cannot be active in ${productId} and deprecated elsewhere`,
				);

			activeVaults.add(addr);
		}

		if (product.deprecatedVaults) {
			for (const addr of product.deprecatedVaults) {
				const normalized = ethers.getAddress(addr);
				if (addr !== normalized)
					throw Error(
						`products: malformed deprecated vault address: ${addr} in ${productId}`,
					);
				if (!vaults[addr])
					throw Error(
						`products: unknown deprecated vault: ${addr} in ${productId}`,
					);

				if (activeVaults.has(addr))
					throw Error(
						`products: vault ${addr} cannot be both active and deprecated (current product: ${productId})`,
					);

				deprecatedVaults.add(addr);
			}
		}

		if (product.deprecationReason !== undefined) {
			if (typeof product.deprecationReason !== "string")
				throw Error(
					`products: deprecationReason must be a string: ${productId}`,
				);
		}

		for (const entity of getArray(product.entity)) {
			if (!entities[entity])
				throw Error(`products: no such entity "${entity}" in ${productId}`);
		}

		if (product.logo && !validUrl(product.logo)) {
			throw Error(
				`products: logo is not a valid URL: ${product.logo} in ${productId}`,
			);
		}
	}

	for (const vaultId of Object.keys(vaults)) {
		if (!activeVaults.has(vaultId) && !deprecatedVaults.has(vaultId))
			throw Error(`vault does not exist in any product: ${vaultId}`);
	}

	for (const point of points) {
		if (point.token && point.token !== ethers.getAddress(point.token))
			throw Error(
				`points: malformed token address: ${point.token} in ${point.name}`,
			);
		if (!point.name) throw Error("points: missing name");
		if (point.url && !validUrl(point.url))
			throw Error(`points: invalid URL: ${point.url} in ${point.name}`);

		if (point.logo && !validUrl(point.logo)) {
			throw Error(
				`points: logo is not a valid URL: ${point.logo} in ${point.name}`,
			);
		}

		if (point.skipValidation) continue;

		if (!point.collateralVaults?.length && !point.liabilityVaults?.length) {
			throw Error(
				`points: missing collateral or liability vaults for ${point.name}`,
			);
		}

		for (const field of ["collateralVaults", "liabilityVaults"]) {
			if (point[field]) {
				for (const addr of point[field]) {
					if (addr !== ethers.getAddress(addr))
						throw Error(
							`points: malformed vault address in ${field}: ${addr} for ${point.name}`,
						);
				}
			}
		}
	}

	for (const vaultId of Object.keys(opportunities)) {
		const vaultOpportunity = opportunities[vaultId];

		if (vaultId !== ethers.getAddress(vaultId))
			throw Error(`opportunities: malformed address: ${vaultId}`);

		if (vaultOpportunity.cozy) {
			if (!vaultOpportunity.cozy.safetyModule)
				throw Error(`opportunities: missing safety module: ${vaultId}`);
			if (
				vaultOpportunity.cozy.safetyModule !==
				ethers.getAddress(vaultOpportunity.cozy.safetyModule)
			)
				throw Error(
					`opportunities: malformed safety module address: ${vaultOpportunity.cozy.safetyModule} for ${vaultId}`,
				);
		}
	}
}

/**
 * Validates that each Ethereum address is only referenced once across all entities
 */
function validateUniqueEntityAddresses(entities) {
	const addressMap = new Map();

	for (const entityId of Object.keys(entities)) {
		const entity = entities[entityId];

		if (!entity.addresses) continue;

		for (const address of Object.keys(entity.addresses)) {
			const normalizedAddress = ethers.getAddress(address);

			if (addressMap.has(normalizedAddress)) {
				const previousEntity = addressMap.get(normalizedAddress);

				// Check for allowed duplicates in config
				const isAllowed =
					CONFIG.duplicateAddressAllowed.includes(previousEntity) ||
					CONFIG.duplicateAddressAllowed.includes(entityId);

				if (!isAllowed) {
					throw Error(
						`Duplicate address ${normalizedAddress} found in entities: ${previousEntity} and ${entityId}`,
					);
				}
			}

			addressMap.set(normalizedAddress, entityId);
		}
	}
}
