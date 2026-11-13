# Catalog images

The originals of the catalog's images ([issue #85](https://github.com/sekoya-solutions/sekoya-parts/issues/85), [ADR 0012](../../docs/adr/0012-front-end-assets.md)): four per category, in `<category>/<n>.jpg`, where `<category>` is the generated category's English name, slugified. `scripts/images.ts` resizes them at build time; they are never served as they are.

## Source

- **Made by:** the owner, with Grok Imagine (xAI), on 2026-11-13. They are AI-generated, not photographs, and not CC0 (owner decision, recorded in ADR 0012).
- **Format:** square JPEGs, 1,600 x 1,600 pixels.
- **Prompt,** the same for every image, with `{SUBJECT}` replaced by the subject below:

```text
Studio product photograph of {SUBJECT}, a household appliance spare part, isolated and centred, three-quarter view from slightly above, the whole part visible and filling about 70% of the frame with an even margin on every side, on a plain seamless warm off-white background, soft diffused light from the upper left, gentle natural shadow under the part, sharp focus, true-to-life materials and colours, square 1:1 format, e-commerce catalogue style. No text, no labels, no logos, no brand names, no hands, no packaging, no watermark.
```

## Subjects

| Folder | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| `basket` | dishwasher lower basket | dishwasher cutlery basket | dishwasher upper rack | dishwasher basket wheel with axle |
| `belt` | coiled ribbed dryer drum belt | washing machine poly-V-belt laid flat | narrow flat rubber drive belt | short ribbed drive belt in a loop |
| `control-board` | washing machine control circuit board | dishwasher main circuit board | oven timer circuit board | refrigerator control circuit board |
| `door-seal` | grey rubber washing machine door gasket | white magnetic refrigerator door seal partly coiled | oven door seal with metal clips | dishwasher door seal |
| `drain-pump` | washing machine drain pump | dishwasher drain pump | drain pump with filter housing | compact drain pump side view |
| `filter` | cylindrical dishwasher mesh filter | metal range hood grease filter | refrigerator water filter cartridge | dryer lint filter |
| `heating-element` | circular oven fan heating element | oven grill heating element | washing machine immersion heating element | dishwasher heating element |
| `hinge` | dishwasher door hinge | oven door hinge | refrigerator door hinge | microwave door hinge |
| `knob` | chrome oven control knob | washing machine programme selector knob | black cooktop knob | dishwasher push button |
| `lamp` | small E14 oven light bulb | oven lamp with round glass cover | refrigerator LED bulb | G9 halogen capsule bulb |
| `motor` | washing machine drum motor | oven fan motor | range hood blower motor | small microwave turntable motor |
| `thermostat` | oven thermostat with capillary tube | refrigerator thermostat with knob shaft | small bimetal dryer thermostat | appliance safety thermal fuse |

## Changing an image

`manifest.json` holds each original's hash, and the build fails when a file differs from it. After replacing an original on purpose, keep it square at 1,600 x 1,600, update its row above, and run `npm run images -- --update-manifest`.
