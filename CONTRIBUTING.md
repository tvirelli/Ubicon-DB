# Contributing a device

Five minutes, three steps:

1. **Add your device record** to `devices/<brand>.json` (create the file if the
   brand is new — lowercase, hyphenated). Records look like:

   ```json
   {
     "id": "acme-doorbell-pro",
     "name": "Acme Doorbell Pro",
     "vendor": "Acme",
     "model": "DB-100",
     "category": "doorbell",
     "keywords": ["video doorbell"],
     "icon": "icons/acme-doorbell-pro.png"
   }
   ```

   `id` is permanent once merged. `category` must be one of the values in
   `schema/device.schema.json`. The icon filename must match the id.

2. **Add the icon**: `icons/<id>.png`, exactly 128×128, transparent
   background, 50 KB max. Flat/line-art style preferred over photos.
   Have an SVG? `node tools/svg2icon.mjs your.svg icons/<id>.png`
   (run `npm install` inside `tools/` first).

3. **Open a pull request.** Automated checks cover everything mechanical; review is only
   about icon quality and appropriateness.

By submitting, you confirm you have the right to contribute the image and
license it under this repo's license (CC0). Product names and likenesses
remain the property of their owners.
