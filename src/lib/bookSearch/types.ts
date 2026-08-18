// 외부 도서 API 응답 타입 — 필요한 필드만 정의한다
// External book API response types — only the fields we consume

export interface KakaoBookDocument {
  title: string;
  authors: string[];
  publisher: string;
  isbn: string;
  thumbnail: string;
  url: string;
  contents: string;
}

export interface KakaoBookResponse {
  documents: KakaoBookDocument[];
}

export interface GoogleVolumeIdentifier {
  type: string;
  identifier: string;
}

export interface GoogleVolumeInfo {
  title?: string;
  authors?: string[];
  publisher?: string;
  pageCount?: number;
  industryIdentifiers?: GoogleVolumeIdentifier[];
  imageLinks?: {
    thumbnail?: string;
    smallThumbnail?: string;
  };
}

export interface GoogleVolume {
  id: string;
  volumeInfo?: GoogleVolumeInfo;
}

export interface GoogleBooksResponse {
  items?: GoogleVolume[];
}
