import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	ItemView,
	moment,
	ExtraButtonComponent,
	Notice,
	requestUrl,
} from "obsidian";
// import axios from "axios";

const CRYPTO_VIEW_TYPE = "crypto";

interface CryptoData {
	symbol: string;
	price: string;
	timestamp: number;
}

interface CryptoSettings {
	apiKey: string;
	symbols: string[];
	refreshInterval: number;
	availableSymbols: {
		symbols: string[];
	};
}

const DEFAULT_SETTINGS: CryptoSettings = {
	apiKey: "",
	symbols: [],
	refreshInterval: 60 * 60, // 60 minutes
	availableSymbols: {
		symbols: [],
	},
};

export default class CryptoPlugin extends Plugin {
	view: CryptoView;
	settings: CryptoSettings;
	updateInterval: NodeJS.Timeout | null = null;
	lastFetch = 0;


	public async onload(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);

		this.registerView(
			CRYPTO_VIEW_TYPE,
			(leaf) => (this.view = new CryptoView(leaf, this))
		);

		this.addCommand({
			id: "open",
			name: "Open",
			callback: this.onShow.bind(this),
		});

		this.addCommand({
			id: "refresh",
			name: "Refresh",
			callback: async () => {
				await this.refreshView();
			},
		});

		let isViewInitialized = false;

		const checkLayoutInterval = setInterval(async () => {
			if (this.app.workspace.layoutReady && !isViewInitialized) {
				await this.initView();
				isViewInitialized = true;
				clearInterval(checkLayoutInterval);
			}
		}, 1000);

		this.app.workspace.onLayoutReady(async () => {
			if (!isViewInitialized) {
				await this.initView();
				isViewInitialized = true;
				clearInterval(checkLayoutInterval);
			}
		});

		this.addSettingTab(new CryptoSettingTab(this.app, this));
	}

	public onunload(): void {
		this.clearUpdateInterval();
	}

	public onShow(): void {
		this.initView();
	}

	private async initView(): Promise<void> {
		if (this.app.workspace.getLeavesOfType(CRYPTO_VIEW_TYPE).length) {
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: CRYPTO_VIEW_TYPE });
			this.app.workspace.revealLeaf(leaf);

			if (this.view instanceof CryptoView) {
				this.view.displayCryptoData();
			} else {
				this.view = new CryptoView(leaf, this);
				this.updateInterval = setInterval(() => {
					this.view.displayCryptoData();
				}, this.settings.refreshInterval * 1000);
			}
		}
	}

	public clearUpdateInterval(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async refreshView(): Promise<void> {
		if (this.view) {
			this.view.displayCryptoData();
			this.clearUpdateInterval();
			this.updateInterval = setInterval(() => {
				this.view.displayCryptoData();
				this.lastFetch = Date.now(); // update the lastFetch timestamp after every refresh
			}, this.settings.refreshInterval * 1000);
		}
	}
}

class CryptoView extends ItemView {
	plugin: CryptoPlugin;
	cryptoContainer: HTMLElement;
	cryptoInfoContainer: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: CryptoPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	async onOpen() {
		this.displayCryptoData();
		this.plugin.updateInterval = setInterval(
			() => this.displayCryptoData(),
			this.plugin.settings.refreshInterval * 1000
		);
	}

	onClose() {
		this.plugin.clearUpdateInterval();
		return super.onClose();
	}

	getViewType() {
		return CRYPTO_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Crypto";
	}

	getIcon(): string {
		return "bitcoin";
	}

	async fetchCryptoData(): Promise<CryptoData[] | undefined> {
		const apiKey = this.plugin.settings.apiKey;
		const symbols = this.plugin.settings.symbols;
		const apiUrl = "https://api.api-ninjas.com/v1/cryptoprice";

		try {
			const cryptoDataArray: CryptoData[] = [];

			for (const symbol of symbols) {
				const url = apiUrl + "?symbol=" + symbol;
				const response = await requestUrl({
					url: url,
					headers: { "X-Api-Key": apiKey },
				});

				const cryptoData: CryptoData = {
					symbol: symbol,
					price: response.json?.price || "N/A",
					timestamp: Date.now(),
				};

				cryptoDataArray.push(cryptoData);
			}
			new Notice("Crypto data refreshed");
			return cryptoDataArray;
		} catch (error) {
			console.error("Failed to fetch crypto data", error);
			return undefined;
		}
	}

	displayCryptoData() {
		const timeSinceLastFetch = Date.now() - this.plugin.lastFetch;

		// Only fetch new data if at least 5 minutes have passed since the last fetch
		if (timeSinceLastFetch > 5 * 60 * 1000) {
			// 5 minutes
			this.fetchCryptoData()
				.then((cryptoDataArray) => {
					console.log("Crypto data:", cryptoDataArray); // added console log
					const symbols = this.plugin.settings.symbols;
					const filteredCryptoDataArray = cryptoDataArray?.filter(
						(cryptoData) => symbols.includes(cryptoData.symbol)
					);

					console.log("Filtered data:", filteredCryptoDataArray); // added console log

					this.containerEl.empty();

					if (
						symbols.length > 0 &&
						filteredCryptoDataArray &&
						filteredCryptoDataArray.length > 0
					) {
						this.cryptoContainer =
							this.containerEl.createDiv("crypto-container");

						const refreshButton = this.cryptoContainer.createDiv(
							"crypto-refresh-button"
						);
						refreshButton.onclick = () => {
							this.plugin.refreshView();
						};

						// Create the ExtraButtonComponent and set the icon and tooltip
						new ExtraButtonComponent(refreshButton)
							.setIcon("refresh-ccw")
							.setTooltip("Refresh", { placement: "top" });

						this.cryptoInfoContainer =
							this.cryptoContainer.createDiv(
								"crypto-info-container"
							);

						filteredCryptoDataArray.forEach((cryptoData) => {
							const cryptoInfo =
								this.createCryptoInfo(cryptoData);
							this.cryptoInfoContainer.appendChild(cryptoInfo);
						});
					} else {
						console.log("No data to display"); // added console log
					}

					this.plugin.lastFetch = Date.now(); // Update lastFetch timestamp after fetching data
				})
				.catch((error) => {
					console.error("Failed to fetch crypto data", error);
				});
		}
	}

	createCryptoInfo(cryptoData: CryptoData) {
		const cryptoInfo = document.createElement("div");
		cryptoInfo.className = "crypto-info";

		const symbolDiv = document.createElement("div");
		symbolDiv.className = "crypto-symbol";
		symbolDiv.textContent = cryptoData.symbol.toUpperCase();

		if (
			this.plugin.settings.availableSymbols.symbols.includes(
				cryptoData.symbol
			)
		) {
			symbolDiv.classList.add("crypto-available");
		} else {
			symbolDiv.classList.add("crypto-unavailable");
		}

		cryptoInfo.appendChild(symbolDiv);

		const priceDiv = document.createElement("div");
		priceDiv.className = "crypto-price";
		priceDiv.textContent = `${cryptoData.price}`;
		cryptoInfo.appendChild(priceDiv);

		const timestampDiv = document.createElement("div");
		timestampDiv.className = "crypto-timestamp";
		const timestamp = moment(cryptoData.timestamp);
		const formattedTimestamp = timestamp.format("YYYY-MM-DD HH:mm");
		timestampDiv.textContent = `Updated: ${formattedTimestamp}`;
		cryptoInfo.appendChild(timestampDiv);

		return cryptoInfo;
	}
}

class CryptoSettingTab extends PluginSettingTab {
	plugin: CryptoPlugin;
	symbolInputs: HTMLInputElement[];
	fetchingSymbolsText: HTMLDivElement | null;
	symbolInputsPlaceholder: HTMLDivElement;

	constructor(app: App, plugin: CryptoPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.symbolInputs = [];
		this.fetchingSymbolsText = null;
	}

	async display() {
		const { containerEl } = this;
		containerEl.empty();
		const div = containerEl.createEl("div", {
			cls: "recent-files-donation",
		});

		const donateText = document.createElement("div");
		donateText.className = "donate-text";

		const donateDescription = document.createElement("p");
		donateDescription.textContent =
			"If you find this plugin valuable and would like to support its development, please consider using the button below. Your contribution is greatly appreciated!";

		donateText.appendChild(donateDescription);

		const donateLink = document.createElement("a");
		donateLink.href = "https://www.buymeacoffee.com/mstam30561";
		donateLink.target = "_blank";

		function rotateColorRandomly(element: HTMLElement) {
			const rotationDegrees = Math.floor(Math.random() * 8 + 1) * 45; // Randomly select a rotation value in increments of 45 degrees
			element.style.filter = `hue-rotate(${rotationDegrees}deg)`;
		}

		const donateImage = document.createElement("img");
		donateImage.src =
			"https://cdn.buymeacoffee.com/buttons/v2/default-blue.png";
		donateImage.alt = "Buy Me A Coffee";

		rotateColorRandomly(donateImage);
		donateImage.classList.add("donate-img");
		donateLink.appendChild(donateImage);
		donateText.appendChild(donateLink);

		div.appendChild(donateText);

		containerEl.createEl("h1", { text: "Crypto Plugin" });

		new Setting(containerEl)
			.setName("API Key")
			.setDesc(
				createFragment((fragment) => {
					fragment.append(
						"Enter your API Key",
						fragment.createEl("br"),
						fragment.createEl("a", {
							text: "Get your free key here",
							href: "https://api-ninjas.com/",
						})
					);
				})
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter API key")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
						this.plugin.refreshView();
						this.display();
						if (this.plugin.settings.apiKey) {
							await this.fetchSymbols();
						}
					})
			);
		if (this.plugin.settings.apiKey) {
			new Setting(containerEl)
				.setName("Refresh Interval (minutes)")
				.setDesc("Set the interval for data refresh")
				.addText((text) =>
					text
						.setPlaceholder("Enter refresh interval in minutes")
						.setValue(
							String(this.plugin.settings.refreshInterval / 60)
						)
						.onChange(async (value) => {
							const minutes = parseInt(value.trim(), 10);
							if (!isNaN(minutes)) {
								this.plugin.settings.refreshInterval =
									minutes * 60;
								await this.plugin.saveSettings();
								this.plugin.refreshView();
							}
						})
				);

			const symbolSettings = new Setting(containerEl)
				.setName("Symbol Selection")
				.setDesc("Enter the crypto symbols you would like to display")
				.setClass("symbol-settings");

			// const symbolSettings = new Setting(containerEl)

			symbolSettings.infoEl.createEl("p", {
				text: "Enter your desired symbols in the text boxes at the right. Symbols will be validated against the available symbols fetched from the API. Valid symbols will be displayed in green with a thumbs up, while invalid symbols will be displayed in red with a thumbs down. Empty inputs will be ignored.",
			});

			this.symbolInputsPlaceholder = symbolSettings.settingEl.createDiv(
				"symbol-inputs-placeholder"
			);

			if (!this.plugin.settings.availableSymbols) {
				// Fetching symbols text
				this.fetchingSymbolsText = containerEl.createEl("div", {
					text: "Fetching symbols...",
					cls: "fetching-symbols-text",
				});

				// Fetch available symbols
				await this.fetchSymbols();

				// Remove fetching symbols text

				this.fetchingSymbolsText.remove();
				this.fetchingSymbolsText = null;
			} else {
				// Display symbol inputs
				this.displaySymbolInputs();
			}
		}
	}

	displaySymbolInputs() {
		// Remove all children from symbolInputsPlaceholder
		this.symbolInputsPlaceholder.empty();
		this.symbolInputs = []; // Clear the symbolInputs array

		for (let i = 0; i < 5; i++) {
			const symbolInputContainer = this.symbolInputsPlaceholder.createDiv(
				"symbol-input-container"
			);

			const symbolInput = symbolInputContainer.createEl("input", {
				attr: {
					type: "text",
					placeholder: "Enter symbol",
					optional: true,
				},
				cls: "crypto-input", // Added CSS class "input"
			}) as HTMLInputElement;

			// const symbolInput = symbolInputContainer.createEl("input", {
			// 	attr: { type: "text", placeholder: "Enter symbol" },
			// }) as HTMLInputElement;
			this.symbolInputs.push(symbolInput);

			symbolInput.value = this.plugin.settings.symbols[i] || "";

			symbolInput.addEventListener("input", () => {
				this.validateAndSaveSymbol(i);
			});

			// Validate and save symbol after it is populated from settings
			this.validateAndSaveSymbol(i);
		}
	}

	async fetchSymbols() {
		const apiKey = this.plugin.settings.apiKey;
		const apiUrl = "https://api.api-ninjas.com/v1/cryptosymbols";

		try {
			const response = await requestUrl({
				url: apiUrl,
				headers: { "X-Api-Key": apiKey },
			});

			const availableSymbols = response.json;

			this.plugin.settings.availableSymbols = availableSymbols;
			await this.plugin.saveSettings();
			new Notice("Successfully fetched symbols");
		} catch (error) {
			console.error("Failed to fetch symbols", error);
			new Notice(
				"Failed to fetch symbols. Check your API key and internet connection."
			);
			throw error; // propagate the error so that the calling function knows there was a problem
		} finally {
			this.displaySymbolInputs(); // Display symbol inputs
		}
	}

	validateAndSaveSymbol(index: number) {
		const symbolInput = this.symbolInputs[index];
		const symbol = symbolInput.value.trim().toLowerCase(); // convert symbol to lowercase

		if (symbol !== "") {
			const isValid = this.plugin.settings.availableSymbols.symbols
				.map((sym) => sym.toLowerCase()) // convert each symbol in the list to lowercase
				.includes(symbol);
			this.setSymbolInputValidity(symbolInput, isValid);

			if (isValid) {
				this.plugin.settings.symbols[index] = symbol;
			}
		} else {
			this.setSymbolInputValidity(symbolInput, true); // Reset validity for empty input

			if (index > -1) {
				this.plugin.settings.symbols.splice(index, 1);
			}
		}

		this.plugin.saveSettings().then(async () => {
			await this.plugin.refreshView();
		});
	}

	setSymbolInputValidity(symbolInput: HTMLInputElement, isValid: boolean) {
		const symbolContainer = symbolInput.parentElement;

		if (symbolContainer) {
			// Remove existing icons
			const existingIcon =
				symbolContainer.querySelector(".symbol-input-icon");
			if (existingIcon) {
				symbolContainer.removeChild(existingIcon);
			}

			const icon = symbolContainer.createEl("span", {
				cls: "symbol-input-icon",
			});

			if (symbolInput.value.trim() === "") {
				// Empty input, add dot icon
				symbolInput.classList.remove("crypto-valid");
				symbolInput.classList.remove("crypto-invalid");
				symbolInput.classList.add("crypto-empty");

				new ExtraButtonComponent(icon)
					.setIcon("text-cursor-input")
					.setTooltip("Empty", { placement: "top" })
					.onClick(() => {
						// Handle click event
					});
			} else if (isValid) {
				// Valid symbol, add thumbs-up icon
				symbolInput.classList.remove("crypto-invalid");
				symbolInput.classList.add("crypto-valid");
				symbolInput.classList.remove("crypto-empty");

				new ExtraButtonComponent(icon)
					.setIcon("thumbs-up")
					.setTooltip("Valid", { placement: "top" })
					.onClick(() => {
						// Handle click event
					});
			} else {
				// Invalid symbol, add thumbs-down icon
				symbolInput.classList.remove("crypto-valid");
				symbolInput.classList.add("crypto-invalid");
				symbolInput.classList.remove("crypto-empty");

				new ExtraButtonComponent(icon)
					.setIcon("thumbs-down")
					.setTooltip("Invalid", { placement: "top" })
					.onClick(() => {
						// Handle click event
					});
			}
		}
	}
}
