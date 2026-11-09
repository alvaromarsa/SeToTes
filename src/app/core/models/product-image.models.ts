export interface ProductImage {
  id: number;
  largeUrl: string;
  cardUrl: string;
}

export interface ProductMainImage {
  largeUrl: string;
  cardUrl: string;
}

export interface ReorderProductImagesRequest {
  imageIds: number[];
}
