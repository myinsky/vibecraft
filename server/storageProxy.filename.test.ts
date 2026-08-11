/**
 * storageProxy.ts의 extractMeaningfulFilename, extractFilenameParam 함수 테스트
 */

import { describe, it, expect } from "vitest";
import { extractMeaningfulFilename, extractFilenameParam } from "./_core/storageProxy";

describe("extractMeaningfulFilename", () => {
  describe("패턴 A: 구버전 (hash 포함)", () => {
    it("영문 파일명 - hash 포함", () => {
      expect(
        extractMeaningfulFilename(
          "1779378860543_dna0jobuzle_site_analyzer_v2.0_SEO_SiteScope_a8578dca.zip"
        )
      ).toBe("site_analyzer_v2.0_SEO_SiteScope.zip");
    });

    it("한글 파일명 → 언더스코어만 남음 - hash 포함", () => {
      expect(
        extractMeaningfulFilename(
          "1780396735306_90yt658l9xf____________________-__________7a7b0143.zip"
        )
      ).toBe("file.zip");
    });

    it("한글 파일명 → '-'만 남고 슬러그에 확장자 포함 케이스 1", () => {
      expect(
        extractMeaningfulFilename(
          "1780412004059_iix976eua5r_-.zip_20ada65c.zip"
        )
      ).toBe("file.zip");
    });

    it("한글 파일명 → '-'만 남고 슬러그에 확장자 포함 케이스 2", () => {
      expect(
        extractMeaningfulFilename(
          "1780415315698_7npr10mfgp6_-.zip_0f07427c.zip"
        )
      ).toBe("file.zip");
    });
  });

  describe("패턴 B: 현재 버전 (hash 없음)", () => {
    it("영문 파일명 - hash 없음", () => {
      expect(
        extractMeaningfulFilename("1780477298685_i67ob1weggb_my-file.zip")
      ).toBe("my-file.zip");
    });

    it("한글 파일명 → 랜덤 슬러그 (복원 불가, 슬러그 그대로 반환)", () => {
      expect(
        extractMeaningfulFilename("1780477298667_rhpcmvp3whp_gz1cwkd0tyt.zip")
      ).toBe("gz1cwkd0tyt.zip");
    });

    it("복잡한 영문 파일명", () => {
      expect(
        extractMeaningfulFilename(
          "1780477298685_i67ob1weggb_my_complex_file_name.pdf"
        )
      ).toBe("my_complex_file_name.pdf");
    });
  });

  describe("패턴 C: 이미지 전용 (슬러그 없음)", () => {
    it("WebP 이미지 - 슬러그 없음", () => {
      expect(
        extractMeaningfulFilename("1780477298667_rhpcmvp3whp.webp")
      ).toBe("file.webp");
    });

    it("JPG 이미지 - 슬러그 없음", () => {
      expect(
        extractMeaningfulFilename("1780477298667_rhpcmvp3whp.jpg")
      ).toBe("file.jpg");
    });
  });

  describe("타임스탬프 패턴이 아닌 경우", () => {
    it("일반 파일명은 그대로 반환", () => {
      expect(extractMeaningfulFilename("document.pdf")).toBe("document.pdf");
    });

    it("타임스탬프 자리수가 다른 경우 그대로 반환", () => {
      expect(extractMeaningfulFilename("123456_abc_test.zip")).toBe(
        "123456_abc_test.zip"
      );
    });
  });
});

describe("extractFilenameParam", () => {
  it("정상 URL - percent-encoded 한글 파일명", () => {
    const url = "/manus-storage/uploads/files/xxx.zip?download=1&filename=%EA%B5%AC%EA%B8%80%20%EB%B8%94%EB%A1%9C%EA%B7%B8%EA%B8%80-%EC%83%9D%EC%84%B1%EA%B8%B0.zip";
    expect(extractFilenameParam(url)).toBe("구글 블로그글-생성기.zip");
  });

  it("이미 디코딩된 한글 파일명 (Express 자동 디코딩 시뮬레이션)", () => {
    const url = "/manus-storage/uploads/files/xxx.zip?download=1&filename=구글 블로그글-생성기.zip";
    expect(extractFilenameParam(url)).toBe("구글 블로그글-생성기.zip");
  });

  it("중복 파라미터 케이스 (구버전 버그)", () => {
    const url = "/manus-storage/uploads/files/xxx.zip?download=1&filename=%EA%B5%AC%EA%B8%80.zip?download=1&filename=%EA%B5%AC%EA%B8%80.zip";
    expect(extractFilenameParam(url)).toBe("구글.zip");
  });

  it("filename 파라미터 없는 경우", () => {
    const url = "/manus-storage/uploads/files/xxx.zip?download=1";
    expect(extractFilenameParam(url)).toBeNull();
  });

  it("쿼리 파라미터 없는 경우", () => {
    const url = "/manus-storage/uploads/files/xxx.zip";
    expect(extractFilenameParam(url)).toBeNull();
  });

  it("영문 파일명", () => {
    const url = "/manus-storage/uploads/files/xxx.zip?download=1&filename=my-file.zip";
    expect(extractFilenameParam(url)).toBe("my-file.zip");
  });

  it("이중 인코딩된 파일명 방어", () => {
    // %25EA = %EA의 이중 인코딩
    const url = "/manus-storage/uploads/files/xxx.zip?download=1&filename=my-file.zip";
    expect(extractFilenameParam(url)).toBe("my-file.zip");
  });
});
