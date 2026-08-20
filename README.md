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

## License

Ubicon-DB uses split licensing:

- **Code and data** - the schema, build scripts, and the textual device records
  in `devices/` and `index.json` are licensed under the MIT License
  (see [LICENSE](LICENSE)).
- **Icon images** - the PNG files in `icons/` are NOT covered by the MIT
  License. Most are low-resolution manufacturer product images included solely
  to identify a device, used under a good-faith fair-use rationale. Copyright in
  those images, and the product names and trademarks they depict, remains with
  their respective owners. The Ubicon project claims no ownership of them and
  grants no license to reuse them; treat each image as reserved by its owner.
  See [NOTICE](NOTICE) for the full statement.

Contributors affirm that each image they submit is their own work, freely
licensed, or a low-resolution manufacturer image used only to identify the
device (see [CONTRIBUTING.md](CONTRIBUTING.md)).

If you own rights to an image here and want it changed or removed, open an issue
or email tvirelli@gmail.com, and it will be handled promptly.
