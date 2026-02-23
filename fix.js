const fs = require("node:fs");
const path = require("node:path");
const { loadJsonFile, saveJsonFile, fixAddress } = require("./utils");

// Get all chain directories
const chainDirs = fs.readdirSync(".").filter((dir) => /^\d+$/.test(dir));

function fixAddressesInArray(addresses, context) {
	let changed = false;
	const fixedAddresses = (addresses || []).map((address) => {
		try {
			const fixedAddress = fixAddress(address);
			if (fixedAddress !== address) {
				console.log(`Fixing ${context}: ${address} -> ${fixedAddress}`);
				changed = true;
				return fixedAddress;
			}
		} catch (error) {
			console.error(`Warning: ${context}: ${error.message}`);
		}
		return address;
	});
	return { result: fixedAddresses, changed };
}

function fixAddressesInObject(obj, context) {
	const result = {};
	let changed = false;

	for (const [key, value] of Object.entries(obj || {})) {
		try {
			const fixedKey = fixAddress(key);
			if (fixedKey !== key) {
				console.log(`Fixing ${context}: ${key} -> ${fixedKey}`);
				changed = true;
			}
			result[fixedKey] = value;
		} catch (error) {
			console.error(`Warning: ${context}: ${error.message}`);
			result[key] = value;
		}
	}

	return { result, changed };
}

function fixChain(chainId) {
	console.log(`\nProcessing chain ${chainId}...`);

	const fileNames = [
		"entities.json",
		"vaults.json",
		"points.json",
		"products.json",
		"opportunities.json",
	];
	const files = {};

	for (const fileName of fileNames) {
		const filePath = path.join(chainId, fileName);
		if (fs.existsSync(filePath)) {
			files[fileName] = {
				data: loadJsonFile(filePath),
				changed: false,
			};
		}
	}

	// Fix entity addresses
	if (files["entities.json"]) {
		for (const [entityId, entity] of Object.entries(
			files["entities.json"].data,
		)) {
			if (entity.addresses) {
				const { result, changed } = fixAddressesInObject(
					entity.addresses,
					`entities.${entityId}`,
				);
				if (changed) {
					entity.addresses = result;
					files["entities.json"].changed = true;
				}
			}
		}
	}

	// Fix vault addresses
	if (files["vaults.json"]) {
		const { result, changed } = fixAddressesInObject(
			files["vaults.json"].data,
			"vault",
		);
		if (changed) {
			files["vaults.json"].data = result;
			files["vaults.json"].changed = true;
		}
	}

	// Fix product vault addresses
	if (files["products.json"]) {
		for (const [productId, product] of Object.entries(
			files["products.json"].data,
		)) {
			const fields = ["vaults", "deprecatedVaults"];
			for (const field of fields) {
				if (product[field]) {
					const { result, changed } = fixAddressesInArray(
						product[field],
						`${field} in products.${productId}`,
					);
					if (changed) {
						product[field] = result;
						files["products.json"].changed = true;
					}
				}
			}
		}
	}

	// Fix points addresses
	if (files["points.json"]) {
		for (const point of files["points.json"].data) {
			if (point.skipValidation) continue;

			if (point.token) {
				try {
					const fixedToken = fixAddress(point.token);
					if (fixedToken !== point.token) {
						console.log(
							`Fixing token address in points.${point.name}: ${point.token} -> ${fixedToken}`,
						);
						point.token = fixedToken;
						files["points.json"].changed = true;
					}
				} catch (error) {
					console.error(`Warning: points.${point.name}: ${error.message}`);
				}
			}

			const fields = ["collateralVaults", "liabilityVaults"];
			for (const field of fields) {
				if (point[field]) {
					const { result, changed } = fixAddressesInArray(
						point[field],
						`${field} in points.${point.name}`,
					);
					if (changed) {
						point[field] = result;
						files["points.json"].changed = true;
					}
				}
			}
		}
	}

	// Fix opportunities addresses
	if (files["opportunities.json"]) {
		const { result, changed } = fixAddressesInObject(
			files["opportunities.json"].data,
			"opportunities",
		);
		if (changed) {
			files["opportunities.json"].data = result;
			files["opportunities.json"].changed = true;
		}

		// Also fix safetyModule addresses inside opportunities
		for (const [vaultId, opportunity] of Object.entries(
			files["opportunities.json"].data,
		)) {
			if (opportunity.cozy?.safetyModule) {
				try {
					const fixedSM = fixAddress(opportunity.cozy.safetyModule);
					if (fixedSM !== opportunity.cozy.safetyModule) {
						console.log(
							`Fixing safetyModule in opportunities.${vaultId}: ${opportunity.cozy.safetyModule} -> ${fixedSM}`,
						);
						opportunity.cozy.safetyModule = fixedSM;
						files["opportunities.json"].changed = true;
					}
				} catch (error) {
					console.error(`Warning: opportunities.${vaultId}: ${error.message}`);
				}
			}
		}
	}

	// Write back only changed files
	let chainChanged = false;
	for (const [fileName, fileInfo] of Object.entries(files)) {
		if (fileInfo.changed) {
			const filePath = path.join(chainId, fileName);
			console.log(`- Updating ${fileName}`);
			saveJsonFile(filePath, fileInfo.data);
			chainChanged = true;
		}
	}

	if (!chainChanged) {
		console.log(`No changes needed for chain ${chainId}`);
	}
}

// Process all chains
for (const chainId of chainDirs) {
	try {
		fixChain(chainId);
	} catch (error) {
		console.error(`Error processing chain ${chainId}:`, error);
		process.exit(1);
	}
}

console.log("\nAddress fixing complete!");
