function nameParts(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .split(/[^a-z0-9]+/).filter(Boolean).filter(part => !["de", "da", "do", "dos", "das", "e"].includes(part));
}
export function makeUsername(name: string) {
  const parts = nameParts(name);
  if (parts.length < 2) throw new Error("Informe nome e sobrenome para gerar o login.");
  return parts.slice(0, 2).join(".");
}
export function usernameFromDisplayName(name: string) {
  const parts = nameParts(name);
  return parts.length < 2 ? null : parts.slice(0, 2).join(".");
}
export function loginEmail(username: string) {
  return `${username.toLowerCase().trim()}@login.gera.invalid`;
}
