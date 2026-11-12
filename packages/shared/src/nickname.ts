export type NicknameValidation =
  | { ok: true; display: string; key: string }
  | { ok: false; code: "NICKNAME_LENGTH" | "NICKNAME_CHARACTERS" | "NICKNAME_RESERVED"; message: string };

const RESERVED = new Set([
  "admin", "administrator", "root", "system", "moderator", "operator", "support",
  "관리자", "운영자", "시스템", "봇", "bot", "문의", "고객센터",
]);

/** Trim and Unicode compatibility-normalize input; compare names case-insensitively. */
export function validateNickname(input: string): NicknameValidation {
  const display = input.normalize("NFKC").trim();
  const count = [...new Intl.Segmenter("ko",{granularity:"grapheme"}).segment(display)].length;
  if (count < 2 || count > 12) {
    return { ok: false, code: "NICKNAME_LENGTH", message: "닉네임은 공백을 제외하고 2~12글자여야 합니다." };
  }
  if (!/^[\p{L}\p{M}\p{N}_-]+$/u.test(display)) {
    return { ok: false, code: "NICKNAME_CHARACTERS", message: "한글·영문·숫자·밑줄(_)·하이픈(-)만 사용할 수 있습니다." };
  }
  const key = display.normalize("NFKC").toLocaleLowerCase("ko-KR");
  if (RESERVED.has(key) || /^(guest|게스트)\d*$/iu.test(key)) {
    return { ok: false, code: "NICKNAME_RESERVED", message: "사용할 수 없는 예약 닉네임입니다." };
  }
  return { ok: true, display, key };
}

