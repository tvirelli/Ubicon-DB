# Ubicon-DB

Community device database for **Ubicon - Device Icons for UniFi**, a browser
extension that lets you assign icons to network clients that UniFi's own
fingerprint database doesn't recognize.

- `devices/` - one JSON file per brand, each an array of device records
- `icons/` - 128×128 transparent PNGs, one per device
- `index.json` - auto-generated merge of everything (what the extension fetches)

**Add your device:** see [CONTRIBUTING.md](CONTRIBUTING.md). PRs welcome.

Data is served to the extension via jsDelivr:
`https://cdn.jsdelivr.net/gh/tvirelli/Ubicon-DB@main/index.json`
