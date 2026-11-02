/** Accent-, case- and whitespace-insensitive form used for stored and queried search text. */
export const searchKey = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
