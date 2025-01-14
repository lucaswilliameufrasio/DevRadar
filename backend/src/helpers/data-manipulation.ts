export function parseStringAsArray(arrayAsString?: string | null) {
  if (!arrayAsString?.length) {
    return [];
  }

  return arrayAsString.split(",").map((tech) => tech.trim());
}
