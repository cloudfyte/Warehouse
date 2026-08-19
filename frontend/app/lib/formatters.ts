export function formatMoney(value: number | string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  }).format(Number(value));
}

function _parts(value: string) {
  const d = new Date(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const hh = String(h % 12 || 12);
  const ampm = h >= 12 ? "PM" : "AM";
  return { dd, mm, yyyy, hh, min, ampm };
}

export function formatDate(value: string) {
  const { dd, mm, yyyy, hh, min, ampm } = _parts(value);
  return `${dd}/${mm}/${yyyy}, ${hh}:${min} ${ampm}`;
}

export function formatDateShort(value: string) {
  const { dd, mm, yyyy } = _parts(value);
  return `${dd}/${mm}/${yyyy}`;
}
