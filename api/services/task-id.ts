import { customAlphabet } from "nanoid";

const TASK_ID_SUFFIX_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const TASK_ID_SUFFIX_LENGTH = 6;
const COMBINING_MARKS_PATTERN = /\p{Mark}/gu;

const LATIN_TRANSLITERATION: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ł: "l",
};

const CYRILLIC_TRANSLITERATION: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  і: "i",
  ї: "i",
  є: "e",
  ґ: "g",
};

export const TASK_ID_RETRY_LIMIT = 20;

export type TaskIdSuffixGenerator = () => string;

export const generateTaskIdSuffix = customAlphabet(
  TASK_ID_SUFFIX_ALPHABET,
  TASK_ID_SUFFIX_LENGTH,
);

export function createHumanizedTaskId(
  title: string,
  suffixGenerator: TaskIdSuffixGenerator = generateTaskIdSuffix,
) {
  return `${createTaskIdPrefix(title)}-${suffixGenerator()}`;
}

export function createTaskIdPrefix(title: string) {
  const words =
    transliterateTitle(title).match(/[a-z0-9]+/g)?.slice(0, 4) ?? [];
  return words.length > 0 ? words.join("-") : "task";
}

function transliterateTitle(title: string) {
  return title
    .normalize("NFKD")
    .replace(COMBINING_MARKS_PATTERN, "")
    .toLowerCase()
    .replace(
      /[ßæœøđł]/g,
      (character) => LATIN_TRANSLITERATION[character] ?? "",
    )
    .replace(
      /[\u0400-\u04ff]/g,
      (character) => CYRILLIC_TRANSLITERATION[character] ?? "",
    );
}
