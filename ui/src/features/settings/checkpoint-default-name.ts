function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function formatCheckpointDefaultName(date = new Date()) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
    "-",
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join("");
}
