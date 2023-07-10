import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	ItemView,
	moment,
	setIcon,
	ExtraButtonComponent,
	TooltipOptions,
	Notice,
} from "obsidian";
import axios from "axios";

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

		if (this.settings.apiKey) {
			await this.fetchAvailableSymbols(); // Fetch available symbols on plugin load
		}

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
			this.updateInterval = setInterval(
				() => this.view.displayCryptoData(),
				this.settings.refreshInterval * 1000
			);
		}
	}

	async fetchAvailableSymbols(): Promise<void> {
		const apiKey = this.settings.apiKey;
		const apiUrl = "https://api.api-ninjas.com/v1/cryptosymbols";

		if (!apiKey) {
			return;
		}

		try {
			const response = await axios.get(apiUrl, {
				headers: { "X-Api-Key": apiKey },
			});

			const fetchedSymbols = response.data?.symbols || [];

			this.settings.availableSymbols = {
				symbols: fetchedSymbols,
			};
			await this.saveSettings();
			new Notice("Symbols have been updated");
		} catch (error) {
			console.error("Failed to fetch available symbols", error);
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
				const url = `${apiUrl}?symbol=${symbol}`;
				const response = await axios.get(url, {
					headers: { "X-Api-Key": apiKey },
				});

				const cryptoData: CryptoData = {
					symbol: symbol,
					price: response.data?.price || "N/A",
					timestamp: Date.now(),
				};

				cryptoDataArray.push(cryptoData);
			}

			return cryptoDataArray;
		} catch (error) {
			console.error("Failed to fetch crypto data", error);
			return undefined;
		}
	}

	displayCryptoData() {
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

					this.cryptoInfoContainer = this.cryptoContainer.createDiv(
						"crypto-info-container"
					);

					filteredCryptoDataArray.forEach((cryptoData) => {
						const cryptoInfo = this.createCryptoInfo(cryptoData);
						this.cryptoInfoContainer.appendChild(cryptoInfo);
					});
				} else {
					console.log("No data to display"); // added console log
				}
			})
			.catch((error) => {
				console.error("Failed to fetch crypto data", error);
			});
	}

	createCryptoInfo(cryptoData: CryptoData) {
		const cryptoInfo = document.createElement("div");
		cryptoInfo.className = "crypto-info";

		const symbolDiv = document.createElement("div");
		symbolDiv.className = "crypto-symbol";
		symbolDiv.textContent = cryptoData.symbol;

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
			.setDesc("Enter your API key")
			.addText((text) =>
				text
					.setPlaceholder("Enter API key")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
						this.plugin.refreshView();
						this.display();
						
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

				try {
					// Fetch available symbols
					await this.fetchSymbols();

					// Remove fetching symbols text
					if (this.fetchingSymbolsText) {
						this.fetchingSymbolsText.remove();
						this.fetchingSymbolsText = null;
					}

					// Display symbol inputs
					this.displaySymbolInputs();
				} catch (error) {
					console.error("Failed to fetch symbols", error);
				}
			} else {
				// Display symbol inputs
				this.displaySymbolInputs();
			}
		}
	}

	validateAndSaveSymbols() {
		const symbols: string[] = [];

		for (const symbolInput of this.symbolInputs) {
			const symbol = symbolInput.value.trim();

			if (symbol !== "") {
				const isValid =
					this.plugin.settings.availableSymbols.symbols.includes(
						symbol
					);
				this.setSymbolInputValidity(symbolInput, isValid);

				if (isValid) {
					symbols.push(symbol);
				}
			} else {
				this.setSymbolInputValidity(symbolInput, true); // Reset validity for empty input
			}
		}

		this.plugin.settings.symbols = symbols;
		this.plugin.saveSettings().then(() => {
			this.plugin.refreshView();
		});
	}

	displaySymbolInputs() {
		// Remove all children from symbolInputsPlaceholder
		this.symbolInputsPlaceholder.empty();

		for (let i = 0; i < 5; i++) {
			const symbolInputContainer = this.symbolInputsPlaceholder.createDiv(
				"symbol-input-container"
			);

			const symbolInput = symbolInputContainer.createEl("input", {
				attr: { type: "text", placeholder: "Enter symbol" },
			}) as HTMLInputElement;
			this.symbolInputs.push(symbolInput);

			symbolInput.value = this.plugin.settings.symbols[i] || "";

			symbolInput.addEventListener("input", () => {
				this.validateAndSaveSymbols();
			});

			this.setSymbolInputValidity(symbolInput, true);
		}
	}

	async fetchSymbols() {
		const apiKey = this.plugin.settings.apiKey;
		const apiUrl = "https://api.api-ninjas.com/v1/cryptosymbols";

		try {
			const response = await axios.get(apiUrl, {
				headers: { "X-Api-Key": apiKey },
			});

			const availableSymbols = response.data;

			this.plugin.settings.availableSymbols = availableSymbols;
			await this.plugin.saveSettings();
		} catch (error) {
			console.error("Failed to fetch symbols", error);
			throw error;
		}
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
