const IMAGE_REQUEST = /\b(image|images|poster|photo|picture|render|visual|artwork|creative)\b/i;
const VIDEO_REQUEST = /\b(video|videos|clip|reel|animation)\b/i;

export type CatalogueProduct = {
  productId: string;
  name: string;
  description: string;
  category: string;
  unitPriceCents: number;
  imageUrl: string;
};

export function isImageRequest(text: string): boolean {
  return IMAGE_REQUEST.test(text);
}

export function isVideoRequest(text: string): boolean {
  return VIDEO_REQUEST.test(text);
}

export function matchCatalogueProducts(
  text: string,
  products: CatalogueProduct[],
): CatalogueProduct[] {
  return products.filter((product) => namesProduct(text, product.name)).slice(0, 4);
}

export function imagenPrompt(guidance: string, products: CatalogueProduct[]): string {
  const lines = products.map((product) => {
    const description = product.description.trim().slice(0, 400);
    const reference = product.imageUrl.trim();
    return [
      `- ${product.name}`,
      description ? `  Description: ${description}` : "",
      reference ? `  Catalogue image: ${reference}` : "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");
  });
  return [
    "Catalogue marketing still photograph for SmartShop.",
    "Products:",
    lines.join("\n"),
    `Guidance: ${guidance}`,
    "No text, logos, or watermarks unless the guidance asks for them.",
  ].join("\n");
}

export function videoPrompt(guidance: string, products: CatalogueProduct[]): string {
  const lines = products.map((product) => {
    const description = product.description.trim().slice(0, 400);
    return [`- ${product.name}`, description ? `  Description: ${description}` : ""]
      .filter((line) => line.length > 0)
      .join("\n");
  });
  return [
    "Short SmartShop catalogue marketing video, about six seconds, no voiceover.",
    "Products:",
    lines.join("\n"),
    `Guidance: ${guidance}`,
    "No text, logos, or watermarks unless the guidance asks for them.",
  ].join("\n");
}

function namesProduct(text: string, name: string): boolean {
  const haystack = text.toLowerCase();
  const productName = name.toLowerCase();
  if (haystack.includes(productName)) {
    return true;
  }
  const words = productName.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  return words.length > 0 && words.every((word) => haystack.includes(word));
}
