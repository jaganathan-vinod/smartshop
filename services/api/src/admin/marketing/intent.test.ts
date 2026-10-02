import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  imagenPrompt,
  isImageRequest,
  isVideoRequest,
  matchCatalogueProducts,
  type CatalogueProduct,
} from "./intent.js";

const mug: CatalogueProduct = {
  productId: "prod_mug",
  name: "Ceramic Mug",
  description: "12 oz stoneware mug",
  category: "home",
  unitPriceCents: 1800,
  imageUrl: "https://cdn.example/mug.jpg",
};

describe("isImageRequest", () => {
  it("treats a catalogue picture as an image turn and an address as planning", () => {
    assert.equal(isImageRequest("image of the Ceramic Mug on a wood table"), true);
    assert.equal(isImageRequest("poster for the mechanical keyboard"), true);
    assert.equal(isImageRequest("punggol"), false);
    assert.equal(isImageRequest("391 Orchard Rd, Singapore"), false);
    assert.equal(isVideoRequest("video of the Ceramic Mug"), true);
    assert.equal(isVideoRequest("image of the Ceramic Mug"), false);
  });
});

describe("matchCatalogueProducts", () => {
  it("matches a catalogue name and ignores an unknown product", () => {
    const matched = matchCatalogueProducts("image of ceramic on a wood table", [mug]);
    assert.equal(matched[0]?.productId, "prod_mug");
    assert.deepEqual(matchCatalogueProducts("image of a bicycle", [mug]), []);
  });
});

describe("imagenPrompt", () => {
  it("includes the product facts and the guidance", () => {
    const prompt = imagenPrompt("Morning light, no text", [mug]);
    assert.match(prompt, /Ceramic Mug/);
    assert.match(prompt, /12 oz stoneware mug/);
    assert.match(prompt, /Morning light, no text/);
    assert.equal(prompt.includes("secret"), false);
  });
});
