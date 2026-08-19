"use client";

import { useEffect, useRef, useState } from "react";
import BookCover from "@/components/BookCover";
import { SEARCH_DEBOUNCE_MS } from "@/lib/constants";
import type { BookSearchResponse, BookSearchResult } from "@/lib/types";

// BarcodeDetector — 크롬/안드로이드 등 지원 브라우저에서만 노출 (iOS 사파리 미지원)
// BarcodeDetector — surfaced only where supported (not on iOS Safari)
interface DetectedBarcode {
  rawValue: string;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => {
      detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
    };
  }
}

// ISBN-13 바코드(EAN-13, 978/979 접두)만 채택한다
// Accept only ISBN-13 barcodes (EAN-13 with a 978/979 prefix)
const ISBN13_PATTERN = /^97[89]\d{10}$/;
const SCAN_INTERVAL_MS = 400;

interface BookSearchProps {
  onSelect: (result: BookSearchResult) => void;
}

// 시트 내 도서 검색 — 즉각적인 반응을 위해 debounce 적용 (스펙 §6)
// In-sheet book search — debounced for instant-feeling feedback (spec §6)
export default function BookSearch({ onSelect }: BookSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [source, setSource] = useState<"kakao" | "google" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSeq = useRef(0);
  // 바코드 스캔 — 시트는 사용자 조작 후에만 마운트되므로 lazy init이 안전하다
  // Barcode scan — sheets mount post-interaction, so lazy init is hydration-safe
  const [barcodeSupported] = useState(
    () => typeof window !== "undefined" && "BarcodeDetector" in window,
  );
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  function stopScan() {
    clearInterval(scanTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function startScan() {
    const Detector = window.BarcodeDetector;
    if (!Detector) {
      return;
    }
    setError("");
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        throw new Error("video element unavailable");
      }
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ["ean_13"] });
      scanTimerRef.current = setInterval(async () => {
        try {
          const codes = await detector.detect(video);
          const isbn = codes.find((code) => ISBN13_PATTERN.test(code.rawValue))?.rawValue;
          if (isbn) {
            stopScan();
            handleQueryChange(isbn);
          }
        } catch (detectError) {
          console.error("[BookSearch] barcode detect failed:", detectError);
        }
      }, SCAN_INTERVAL_MS);
    } catch (cameraError) {
      console.error("[BookSearch] camera unavailable:", cameraError);
      setError("카메라를 열 수 없어요. 권한을 확인해 주세요.");
      stopScan();
    }
  }

  // 언마운트(시트 닫힘) 시 카메라를 반드시 해제한다
  // Always release the camera when the sheet unmounts
  useEffect(() => {
    return () => {
      clearInterval(scanTimerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // 빈 검색어 리셋은 입력 핸들러에서 처리해 effect 내 동기 setState를 피한다
  // Reset-on-empty happens in the input handler to avoid sync setState in effects
  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim() === "") {
      setResults([]);
      setError("");
      setLoading(false);
    } else {
      setError("");
      setLoading(true);
    }
  }

  useEffect(() => {
    const seq = ++requestSeq.current;
    const trimmed = query.trim();
    if (trimmed === "") {
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/books/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`search failed: ${response.status}`);
        }
        const data = (await response.json()) as BookSearchResponse;
        // 이전 요청의 늦은 응답이 최신 결과를 덮어쓰지 않도록 한다
        // Prevent a stale response from overwriting newer results
        if (seq === requestSeq.current) {
          setResults(data.results);
          setSource(data.source);
          setError("");
        }
      } catch (searchError) {
        if (controller.signal.aborted) {
          return;
        }
        console.error("[BookSearch] search failed:", searchError);
        if (seq === requestSeq.current) {
          setResults([]);
          setError("검색에 실패했어요. 잠시 후 다시 시도해 주세요.");
        }
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="px-2">
      <div className="flex items-center gap-2">
        <input
          type="search"
          aria-label="책 제목이나 저자 검색"
          autoFocus
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="책 제목이나 저자를 검색"
          className="w-full flex-1 rounded-xl bg-fill px-4 py-3 text-[15px] outline-none placeholder:text-ink-tertiary focus:ring-2 focus:ring-tint"
        />
        {barcodeSupported && !scanning && (
          <button
            type="button"
            onClick={() => void startScan()}
            aria-label="ISBN 바코드 스캔"
            className="shrink-0 cursor-pointer rounded-xl bg-fill px-3 py-3 text-[13px] font-medium text-tint active:opacity-70"
          >
            바코드
          </button>
        )}
      </div>

      {/* 스캔 중 카메라 미리보기 — 뒷면 바코드를 비추면 자동 인식된다 */}
      {/* Live camera preview while scanning — point at the back-cover barcode */}
      <div className={scanning ? "mt-3" : "hidden"}>
        <video
          ref={videoRef}
          muted
          playsInline
          className="aspect-video w-full rounded-xl bg-black object-cover"
        />
        <button
          type="button"
          onClick={stopScan}
          className="mt-2 w-full cursor-pointer py-1.5 text-sm font-medium text-ink-tertiary transition-colors duration-150 hover:text-ink active:opacity-70"
        >
          스캔 취소
        </button>
      </div>

      <div className="mt-3 min-h-48">
        {error !== "" && (
          <p role="alert" className="px-2 py-8 text-center text-sm text-ink-secondary">
            {error}
          </p>
        )}

        {error === "" && !loading && query.trim() !== "" && results.length === 0 && (
          <p role="status" className="px-2 py-8 text-center text-sm text-ink-secondary">
            검색 결과가 없어요.
          </p>
        )}

        {results.length > 0 && (
          <p role="status" className="sr-only">
            검색 결과 {results.length}개
          </p>
        )}

        <ul className="divide-y divide-separator">
          {results.map((result, index) => (
            <li key={`${result.isbn13}-${index}`}>
              <button
                type="button"
                onClick={() => onSelect(result)}
                className="flex w-full cursor-pointer items-center gap-3.5 py-3 text-left active:opacity-60"
              >
                <BookCover title={result.title} coverUrl={result.coverUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{result.title}</p>
                  <p className="truncate text-sm text-ink-secondary">
                    {result.authors.join(", ")}
                    {result.publisher && ` · ${result.publisher}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-tint">읽기 시작</span>
              </button>
            </li>
          ))}
        </ul>

        {loading && results.length === 0 && (
          <p role="status" className="px-2 py-8 text-center text-sm text-ink-tertiary">
            검색 중…
          </p>
        )}

        {results.length > 0 && source !== null && (
          <p className="px-2 py-2 text-right text-[11px] text-ink-tertiary">
            출처 · {source === "kakao" ? "카카오 도서" : "Google Books"}
          </p>
        )}
      </div>
    </div>
  );
}
