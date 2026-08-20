# Contributing a device

Five minutes, four steps:

1. **Add your device record** to `devices/<brand>.json` (create the file if the
   brand is new; lowercase, hyphenated). Records look like:

   ```json
   {
     "id": "acme-doorbell-pro",
     "name": "Acme Doorbell Pro",
     "vendor": "Acme",
     "model": "DB-100",
     "category": "doorbell",
     "keywords": ["video doorbell"],
     "icon": "icons/acme-doorbell-pro.png",
     "contributor": "Jane Doe"
   }
   ```

   `id` is permanent once merged. `category` must be one of the values in
   `schema/device.schema.json`. The icon filename must match the id.
   `contributor` is optional: a credit-only name (max 60 characters); leave
   it out if you'd rather not be credited.

   **Two kinds of entry.** The record above is a *real device*: a specific
   branded product, so it has a `vendor` and `model`. Ubicon also has *generic
   device types*: brandless fallback icons for a kind of device (a generic
   "IP Security Camera", "NAS", "Smart Plug"). These live in
   `devices/generic.json`, are marked with `"type": "generic"`, and omit
   `vendor` and `model` entirely:

   ```json
   {
     "id": "network-air-quality-monitor",
     "name": "Network Air Quality Monitor",
     "type": "generic",
     "category": "sensor",
     "keywords": ["generic", "air", "quality", "monitor"],
     "icon": "icons/network-air-quality-monitor.png",
     "contributor": "Jane Doe"
   }
   ```

   Use a generic entry when the icon represents a category of device rather
   than one product. Real devices may set `"type": "real"` but it is the
   default and can be left out.

2. **Add the icon**: `icons/<id>.png`, exactly 128×128 at 72 DPI, transparent
   background, 50 KB max. For real products, use a real product photo on a
   transparent background, matching UniFi's own icon style. Illustrations
   are fine for custom or general-use device entries (generic sensors, DIY
   devices, and the like). Either way, the image must stay legible on both
   light and dark backgrounds: use mid-tone fills or light outlines rather
   than near-black silhouettes. Have an SVG? `node tools/svg2icon.mjs your.svg
   icons/<id>.png` (run `npm install` inside `tools/` first). Your SVG must
   have a square viewBox.

3. **Before opening a pull request**, run `npm test && npm run validate`
   locally and make sure both pass. Do not edit `index.json`; it is
   regenerated automatically on merge.

4. **Open a pull request.** Automated checks cover everything mechanical; review is only
   about icon quality and appropriateness.

By submitting, you confirm the image is your own, freely licensed, or a
low-resolution manufacturer product photo used solely to identify the device.
Ubicon-DB serves small 128×128 identification thumbnails, the same footing
UniFi's own device icons stand on. Product names and likenesses remain the
property of their owners.
